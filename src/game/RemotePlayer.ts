import * as THREE from 'three';
import { Engine } from './Engine';

export class RemotePlayer {
  public mesh: THREE.Group;
  public id: string;
  public health: number = 100;
  public weapon: string | null = null;
  private engine: Engine;

  constructor(engine: Engine, id: string, name: string) {
    this.engine = engine;
    this.id = id;

    this.mesh = new THREE.Group();
    (this.mesh as any).userData = { id: this.id };
    
    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.8, 4, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x111111 }); // Pants
    
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.15, 0.5, 0);
    this.mesh.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.15, 0.5, 0);
    this.mesh.add(rightLeg);

    // Torso
    const torsoGeo = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 }); // Red Shirt for enemies
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.3;
    torso.castShadow = true;
    (torso as any).userData = { id: this.id };
    this.mesh.add(torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.0;
    head.castShadow = true;
    (head as any).userData = { id: this.id };
    this.mesh.add(head);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.45, 1.5, 0);
    leftArm.rotation.z = Math.PI / 8;
    this.mesh.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.45, 1.5, 0);
    rightArm.rotation.z = -Math.PI / 8;
    this.mesh.add(rightArm);

    // Name tag
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = 'white';
    context.font = 'bold 32px Inter, sans-serif';
    context.textAlign = 'center';
    context.fillText(name, 128, 42);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.2;
    sprite.scale.set(2, 0.5, 1);
    this.mesh.add(sprite);

    this.engine.scene.add(this.mesh);
  }

  public update(data: { x: number; y: number; z: number; rotation: number }) {
    this.mesh.position.set(data.x, data.y, data.z);
    this.mesh.rotation.y = data.rotation;
  }

  public destroy() {
    this.engine.scene.remove(this.mesh);
  }
}
