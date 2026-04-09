import * as THREE from 'three';
import { Engine } from './Engine';
import { Input } from './Input';
import { World } from './World';

export class Player {
  public mesh: THREE.Group;
  public health = 100;
  public kills = 0;
  public weapon: string | null = null;
  public state: 'lobby' | 'jumping' | 'alive' | 'dead' = 'lobby';
  public isCrouching = false;

  private velocity = new THREE.Vector3();
  private moveVelocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.18;
  private sensitivity = 0.0022;
  private walkSpeed = 6;
  private sprintSpeed = 10.5;
  private crouchSpeed = 3.3;
  private jumpSpeed = 7.2;
  private gravity = 22;
  private cameraDistance = 7.6;
  private grounded = true;
  private walkTime = 0;

  private pelvis = new THREE.Group();
  private torsoPivot = new THREE.Group();
  private headPivot = new THREE.Group();
  private leftArmPivot = new THREE.Group();
  private rightArmPivot = new THREE.Group();
  private leftForearmPivot = new THREE.Group();
  private rightForearmPivot = new THREE.Group();
  private leftLegPivot = new THREE.Group();
  private rightLegPivot = new THREE.Group();
  private gunGroup = new THREE.Group();
  private shoulderCape: THREE.Mesh | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly input: Input,
    private readonly world: World,
  ) {
    if (this.input.isMobile) {
      this.sensitivity = 0.0015;
      this.cameraDistance = 6.6;
    }
    this.mesh = new THREE.Group();
    this.buildCharacter();
    this.engine.scene.add(this.mesh);
  }

  public update(delta: number) {
    if (this.state === 'dead') return;

    const look = this.input.consumeLookDelta();
    this.yaw -= look.x * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * this.sensitivity, -0.95, 0.6);
    this.mesh.rotation.y = this.yaw;

    this.isCrouching = Boolean(this.input.keys['KeyC'] || this.input.keys['ControlLeft']);
    this.mesh.scale.y = this.isCrouching ? 0.8 : 1;

    const moveInput = this.input.getMoveVector();
    const inputDir = new THREE.Vector3(moveInput.x, 0, moveInput.z);
    if (inputDir.lengthSq() > 1) inputDir.normalize();

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const desiredDirection = new THREE.Vector3()
      .addScaledVector(right, inputDir.x)
      .addScaledVector(forward, inputDir.z);

    if (desiredDirection.lengthSq() > 1e-4) desiredDirection.normalize();

    const speed = this.isCrouching
      ? this.crouchSpeed
      : this.input.keys['ShiftLeft'] || this.input.keys['ShiftRight']
        ? this.sprintSpeed
        : this.walkSpeed;

    this.moveVelocity.lerp(desiredDirection.multiplyScalar(speed), 1 - Math.exp(-delta * 14));
    this.velocity.x = this.moveVelocity.x;
    this.velocity.z = this.moveVelocity.z;

    if (this.grounded && this.input.keys['Space']) {
      this.velocity.y = this.jumpSpeed;
      this.grounded = false;
    } else {
      this.velocity.y -= this.gravity * delta;
    }

    const nextPosition = this.mesh.position.clone().addScaledVector(this.velocity, delta);
    const currentGround = this.world.getHeight(this.mesh.position.x, this.mesh.position.z);
    const nextGround = this.world.getHeight(nextPosition.x, nextPosition.z);
    if (nextGround - currentGround > 1.2) {
      nextPosition.x = this.mesh.position.x;
      nextPosition.z = this.mesh.position.z;
    }

    this.mesh.position.copy(nextPosition);
    const groundHeight = this.world.getHeight(this.mesh.position.x, this.mesh.position.z);
    const standingHeight = this.isCrouching ? 1.15 : 1.7;
    if (this.mesh.position.y <= groundHeight) {
      this.mesh.position.y = groundHeight;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    if (this.world.isWater(this.mesh.position.x, this.mesh.position.z)) {
      this.velocity.multiplyScalar(0.92);
      this.mesh.position.y = Math.max(this.mesh.position.y, groundHeight + 0.1);
    }

    this.animateRig(delta, speed);

    const pivot = this.mesh.position.clone().add(new THREE.Vector3(0, standingHeight, 0));
    const cameraOffset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    )
      .normalize()
      .multiplyScalar(-this.cameraDistance);
    const desiredCamera = pivot.clone().add(cameraOffset);
    const correctedCamera = this.resolveCameraCollision(pivot, desiredCamera);
    this.engine.camera.position.lerp(correctedCamera, 1 - Math.exp(-delta * 12));
    this.engine.camera.lookAt(pivot);
  }

  public getPosition() {
    return {
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z,
      rotation: this.mesh.rotation.y,
    };
  }

  public getInput() {
    return this.input;
  }

  private buildCharacter() {
    this.mesh.add(this.pelvis);

    const pelvisCore = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.36, 0.34),
      new THREE.MeshStandardMaterial({ color: '#2B2A29', roughness: 0.92 }),
    );
    pelvisCore.position.y = 1.08;
    pelvisCore.castShadow = true;
    this.pelvis.add(pelvisCore);

    const torsoShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 1.16, 0.44),
      new THREE.MeshStandardMaterial({ color: '#23272B', roughness: 0.94 }),
    );
    this.torsoPivot.position.y = 1.58;
    torsoShell.castShadow = true;
    this.torsoPivot.add(torsoShell);

    const chestHarness = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.86, 0.5),
      new THREE.MeshStandardMaterial({ color: '#50483C', roughness: 0.96 }),
    );
    chestHarness.position.y = -0.02;
    chestHarness.castShadow = true;
    this.torsoPivot.add(chestHarness);

    const shoulderWrap = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.24, 0.66),
      new THREE.MeshStandardMaterial({ color: '#1B1F22', roughness: 0.98 }),
    );
    shoulderWrap.position.y = 0.48;
    shoulderWrap.castShadow = true;
    this.torsoPivot.add(shoulderWrap);

    this.shoulderCape = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.75, 0.12),
      new THREE.MeshStandardMaterial({ color: '#1E2124', roughness: 1 }),
    );
    this.shoulderCape.position.set(0, 0.18, -0.24);
    this.shoulderCape.rotation.x = 0.22;
    this.torsoPivot.add(this.shoulderCape);

    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.03, 8, 24),
      new THREE.MeshStandardMaterial({ color: '#7A6B56', roughness: 1 }),
    );
    rope.position.set(0.34, -0.42, 0.18);
    rope.rotation.set(Math.PI / 2, 0.4, 0.2);
    this.torsoPivot.add(rope);

    this.pelvis.add(this.torsoPivot);

    this.headPivot.position.set(0, 0.82, -0.02);
    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 0.72, 6),
      new THREE.MeshStandardMaterial({ color: '#1A1D20', roughness: 1 }),
    );
    hood.position.y = 0.1;
    hood.rotation.x = Math.PI;
    hood.castShadow = true;
    this.headPivot.add(hood);

    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 14),
      new THREE.MeshStandardMaterial({ color: '#836E5A', roughness: 0.92 }),
    );
    face.position.y = 0.05;
    face.castShadow = true;
    this.headPivot.add(face);

    const mask = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.24, 0.22),
      new THREE.MeshStandardMaterial({ color: '#101316', roughness: 1 }),
    );
    mask.position.set(0, -0.02, 0.12);
    this.headPivot.add(mask);
    this.torsoPivot.add(this.headPivot);

    this.leftArmPivot.position.set(-0.47, 0.42, -0.04);
    this.rightArmPivot.position.set(0.47, 0.42, -0.04);
    this.leftForearmPivot.position.set(0, -0.46, 0);
    this.rightForearmPivot.position.set(0, -0.46, 0);

    this.leftArmPivot.add(this.createLimb(0.1, 0.58, '#262A2E'));
    this.rightArmPivot.add(this.createLimb(0.1, 0.58, '#262A2E'));
    this.leftForearmPivot.add(this.createLimb(0.085, 0.48, '#433A32'));
    this.rightForearmPivot.add(this.createLimb(0.085, 0.48, '#433A32'));
    this.leftArmPivot.add(this.leftForearmPivot);
    this.rightArmPivot.add(this.rightForearmPivot);

    const leftHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color: '#7A6251', roughness: 0.95 }),
    );
    leftHand.position.y = -0.46;
    this.leftForearmPivot.add(leftHand);

    const rightHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color: '#7A6251', roughness: 0.95 }),
    );
    rightHand.position.y = -0.46;
    this.rightForearmPivot.add(rightHand);

    this.torsoPivot.add(this.leftArmPivot);
    this.torsoPivot.add(this.rightArmPivot);

    this.leftLegPivot.position.set(-0.2, 0.92, 0);
    this.rightLegPivot.position.set(0.2, 0.92, 0);
    this.leftLegPivot.add(this.createLimb(0.12, 0.86, '#191D22'));
    this.rightLegPivot.add(this.createLimb(0.12, 0.86, '#191D22'));

    const leftBoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: '#2C2925', roughness: 0.97 }),
    );
    leftBoot.position.set(0, -0.52, 0.08);
    const rightBoot = leftBoot.clone();
    this.leftLegPivot.add(leftBoot);
    this.rightLegPivot.add(rightBoot);

    this.pelvis.add(this.leftLegPivot);
    this.pelvis.add(this.rightLegPivot);

    this.gunGroup.position.set(0.33, 0.1, -0.34);
    this.gunGroup.rotation.set(-0.08, 0, -0.04);
    this.gunGroup.add(this.createGunMesh());
    this.rightForearmPivot.add(this.gunGroup);
  }

  private createLimb(radius: number, length: number, color: string) {
    const limb = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, length, 4, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    );
    limb.position.y = -length / 2;
    limb.castShadow = true;
    return limb;
  }

  private createGunMesh() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.16, 0.92),
      new THREE.MeshStandardMaterial({ color: '#202224', roughness: 0.82 }),
    );
    body.castShadow = true;
    group.add(body);

    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.18, 0.32),
      new THREE.MeshStandardMaterial({ color: '#53473A', roughness: 0.92 }),
    );
    stock.position.set(0, -0.02, 0.44);
    stock.castShadow = true;
    group.add(stock);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.58, 8),
      new THREE.MeshStandardMaterial({ color: '#1A1D1F', roughness: 0.8 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.7;
    barrel.castShadow = true;
    group.add(barrel);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.26, 0.12),
      new THREE.MeshStandardMaterial({ color: '#2B2F33', roughness: 0.9 }),
    );
    grip.position.set(0, -0.2, 0.06);
    grip.rotation.x = 0.36;
    group.add(grip);

    return group;
  }

  private animateRig(delta: number, speed: number) {
    const planarSpeed = Math.min(1, this.moveVelocity.length() / Math.max(speed, 0.01));
    this.walkTime += delta * (2.4 + planarSpeed * 5.2);
    const cycle = Math.sin(this.walkTime);
    const counter = Math.sin(this.walkTime + Math.PI);
    const upperTwist = Math.sin(this.walkTime * 0.5) * planarSpeed * 0.05;

    this.pelvis.position.y = 0.02 + Math.abs(cycle) * planarSpeed * 0.04;
    this.torsoPivot.rotation.x = -0.06 + planarSpeed * 0.05;
    this.torsoPivot.rotation.z = upperTwist;
    this.headPivot.rotation.x = -this.pitch * 0.25;

    this.leftLegPivot.rotation.x = cycle * 0.7 * planarSpeed;
    this.rightLegPivot.rotation.x = counter * 0.7 * planarSpeed;

    this.leftArmPivot.rotation.x = -0.4 + counter * 0.18 * planarSpeed;
    this.leftArmPivot.rotation.z = -0.35;
    this.leftForearmPivot.rotation.x = -0.95 + cycle * 0.09 * planarSpeed;
    this.leftForearmPivot.rotation.z = 0.22;

    this.rightArmPivot.rotation.x = -1.15 + counter * 0.08 * planarSpeed - this.pitch * 0.15;
    this.rightArmPivot.rotation.y = 0.08;
    this.rightArmPivot.rotation.z = -0.12;
    this.rightForearmPivot.rotation.x = -0.98 - this.pitch * 0.08;
    this.rightForearmPivot.rotation.z = 0.08;

    this.gunGroup.rotation.z = 0.03 + counter * 0.04 * planarSpeed;
    this.gunGroup.rotation.y = -0.03 + this.pitch * 0.05;

    if (this.shoulderCape) {
      this.shoulderCape.rotation.x = 0.18 + planarSpeed * 0.06 + Math.abs(cycle) * 0.03;
    }
  }

  private resolveCameraCollision(pivot: THREE.Vector3, desiredCamera: THREE.Vector3) {
    const raycaster = new THREE.Raycaster(pivot, desiredCamera.clone().sub(pivot).normalize(), 0.1, this.cameraDistance);
    const hits = raycaster.intersectObjects(this.world.getCameraCollisionObjects(), true);
    let target = desiredCamera.clone();
    if (hits.length > 0) {
      target = hits[0].point
        .clone()
        .add((hits[0].face?.normal ?? new THREE.Vector3(0, 0.6, 0)).clone().multiplyScalar(0.15));
    }
    const minHeight = this.world.getHeight(target.x, target.z) + 1.1;
    target.y = Math.max(target.y, minHeight);
    return target;
  }
}
