import * as THREE from 'three';
import { Engine } from '../Engine';
import { World } from '../World';

type BotState = 'patrol' | 'engage' | 'reposition' | 'dead';

type BotContext = {
  playerPosition: THREE.Vector3;
  zone: { x: number; z: number; radius: number };
  onPlayerDamage: (amount: number) => void;
  onBotEliminated: (id: string) => void;
};

type BotAgent = {
  id: string;
  mesh: THREE.Group;
  state: BotState;
  health: number;
  speed: number;
  patrolTarget: THREE.Vector3;
  fireCooldown: number;
  retargetCooldown: number;
  walkTime: number;
  preferredRange: number;
  accuracy: number;
  strafeSign: number;
};

function randomPatrolPoint(world: World, seed: number) {
  const lot = world.layout.buildingLots[(seed * 17 + 11) % world.layout.buildingLots.length];
  return new THREE.Vector3(lot.center.x, world.getHeight(lot.center.x, lot.center.z), lot.center.z);
}

function buildBotMesh(id: string) {
  const group = new THREE.Group();
  group.userData = { botId: id };

  const legMat = new THREE.MeshStandardMaterial({ color: '#2A2B30', roughness: 0.95 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#5A3B2F', roughness: 0.92 });
  const clothMat = new THREE.MeshStandardMaterial({ color: '#20252A', roughness: 1 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#8F765F', roughness: 0.9 });

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.28), clothMat);
  pelvis.position.y = 1.02;
  group.add(pelvis);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.98, 0.4), bodyMat);
  torso.position.y = 1.58;
  torso.castShadow = true;
  torso.userData = { botId: id };
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.42, 0.46), clothMat);
  chest.position.y = 1.72;
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinMat);
  head.position.y = 2.28;
  head.castShadow = true;
  head.userData = { botId: id };
  group.add(head);

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 6), clothMat);
  hood.position.y = 2.48;
  hood.rotation.x = Math.PI;
  group.add(hood);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.74, 4, 8), legMat);
  leftLeg.position.set(-0.16, 0.48, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.16;
  group.add(rightLeg);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.54, 4, 8), clothMat);
  leftArm.position.set(-0.42, 1.58, 0);
  leftArm.rotation.z = 0.28;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.42;
  rightArm.rotation.z = -0.18;
  group.add(rightArm);

  const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.72), new THREE.MeshStandardMaterial({ color: '#222629', roughness: 0.85 }));
  weapon.position.set(0.16, 1.44, -0.22);
  weapon.rotation.set(-0.2, 0.1, -0.18);
  group.add(weapon);

  return group;
}

export class OfflineBotSystem {
  private readonly bots: BotAgent[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly world: World,
  ) {}

  public reset(count: number, avoidPosition: THREE.Vector3) {
    this.destroy();
    const spawnLots = this.world.layout.buildingLots.filter(
      (lot) => Math.hypot(lot.center.x - avoidPosition.x, lot.center.z - avoidPosition.z) > 260,
    );

    for (let index = 0; index < count; index += 1) {
      const lot = spawnLots[(index * 13 + 7) % spawnLots.length] ?? this.world.layout.buildingLots[index % this.world.layout.buildingLots.length];
      const mesh = buildBotMesh(`bot-${index}`);
      const y = this.world.getHeight(lot.center.x, lot.center.z);
      mesh.position.set(lot.center.x, y, lot.center.z);
      this.engine.scene.add(mesh);
      this.bots.push({
        id: `bot-${index}`,
        mesh,
        state: 'patrol',
        health: 100,
        speed: 4.1 + (index % 3) * 0.35,
        patrolTarget: randomPatrolPoint(this.world, index),
        fireCooldown: 0.5 + (index % 4) * 0.18,
        retargetCooldown: 0.2,
        walkTime: index * 0.37,
        preferredRange: 18 + (index % 4) * 5,
        accuracy: 0.46 + (index % 5) * 0.06,
        strafeSign: index % 2 === 0 ? 1 : -1,
      });
    }
  }

  public update(delta: number, context: BotContext) {
    this.bots.forEach((bot, index) => {
      if (bot.state === 'dead') return;

      bot.fireCooldown -= delta;
      bot.retargetCooldown -= delta;
      bot.walkTime += delta * 4.2;

      const playerDistance = bot.mesh.position.distanceTo(context.playerPosition);
      const zoneDistance = Math.hypot(bot.mesh.position.x - context.zone.x, bot.mesh.position.z - context.zone.z);
      const outsideZone = zoneDistance > context.zone.radius - 24;

      if (outsideZone) {
        bot.state = 'reposition';
        bot.patrolTarget.set(context.zone.x, this.world.getHeight(context.zone.x, context.zone.z), context.zone.z);
      } else if (playerDistance < 138) {
        bot.state = 'engage';
      } else if (bot.state === 'engage' && playerDistance >= 158) {
        bot.state = 'patrol';
      }

      if (bot.state === 'patrol' && bot.mesh.position.distanceTo(bot.patrolTarget) < 9) {
        bot.patrolTarget = randomPatrolPoint(this.world, index + Math.floor(performance.now() * 0.001));
      }

      if (bot.retargetCooldown <= 0 && bot.state === 'engage') {
        const toPlayer = context.playerPosition.clone().sub(bot.mesh.position);
        toPlayer.y = 0;
        if (toPlayer.lengthSq() > 0.001) {
          toPlayer.normalize();
        }
        const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(bot.strafeSign * (8 + index % 4));
        const chaseOffset = toPlayer.clone().multiplyScalar(playerDistance > bot.preferredRange ? 6 : playerDistance < bot.preferredRange - 4 ? -7 : -2);
        bot.patrolTarget.set(
          context.playerPosition.x + side.x + chaseOffset.x,
          0,
          context.playerPosition.z + side.z + chaseOffset.z,
        );
        bot.patrolTarget.y = this.world.getHeight(bot.patrolTarget.x, bot.patrolTarget.z);
        bot.retargetCooldown = 0.65 + Math.random() * 0.45;
        bot.strafeSign *= -1;
      }

      const target = bot.state === 'engage' ? bot.patrolTarget : bot.patrolTarget;
      const move = target.clone().sub(bot.mesh.position);
      move.y = 0;
      const distance = move.length();
      if (distance > 0.25) {
        move.normalize();
        const speed = bot.state === 'engage' ? bot.speed * 1.16 : bot.speed;
        bot.mesh.position.addScaledVector(move, delta * speed);
        bot.mesh.position.y = this.world.getHeight(bot.mesh.position.x, bot.mesh.position.z);
        bot.mesh.rotation.y = Math.atan2(move.x, move.z);
      }

      const bodyBob = Math.abs(Math.sin(bot.walkTime)) * (distance > 0.2 ? 0.05 : 0.01);
      bot.mesh.position.y = this.world.getHeight(bot.mesh.position.x, bot.mesh.position.z) + bodyBob;

      if (bot.state === 'engage') {
        const aimDirection = context.playerPosition.clone().sub(bot.mesh.position);
        aimDirection.y = 0;
        if (aimDirection.lengthSq() > 0.001) {
          bot.mesh.rotation.y = Math.atan2(aimDirection.x, aimDirection.z);
        }

        if (playerDistance < 58 && bot.fireCooldown <= 0) {
          const closeBias = playerDistance < 16 ? 0.28 : playerDistance < 28 ? 0.16 : 0.06;
          const hitChance = Math.min(0.92, bot.accuracy + closeBias);
          if (Math.random() < hitChance) {
            context.onPlayerDamage(playerDistance < 16 ? 16 : playerDistance < 28 ? 11 : 8);
          }
          bot.fireCooldown = 0.38 + Math.random() * 0.42;
        }
      }
    });
  }

  public getAliveCount() {
    return this.bots.filter((bot) => bot.state !== 'dead').length;
  }

  public getAlivePositions() {
    return this.bots
      .filter((bot) => bot.state !== 'dead')
      .map((bot) => ({ x: bot.mesh.position.x, z: bot.mesh.position.z }));
  }

  public getRaycastTargets() {
    return this.bots.filter((bot) => bot.state !== 'dead').map((bot) => bot.mesh);
  }

  public applyDamage(botId: string, damage: number) {
    const bot = this.bots.find((candidate) => candidate.id === botId);
    if (!bot || bot.state === 'dead') return false;
    bot.health -= damage;
    if (bot.health <= 0) {
      bot.state = 'dead';
      bot.mesh.visible = false;
      return true;
    }
    bot.state = 'engage';
    bot.fireCooldown = Math.min(bot.fireCooldown, 0.25);
    bot.speed = Math.min(5.8, bot.speed + 0.08);
    return false;
  }

  public destroy() {
    this.bots.forEach((bot) => {
      this.engine.scene.remove(bot.mesh);
    });
    this.bots.length = 0;
  }
}
