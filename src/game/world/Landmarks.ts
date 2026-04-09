import * as THREE from 'three';
import { STREAMING_SECTOR_SIZE, WORLD_BOUNDS } from '../config/mapConfig';
import type { WorldLayout } from './types';
import { TerrainSystem } from './Terrain';

function sectorKey(x: number, z: number) {
  const col = Math.floor((x - WORLD_BOUNDS.minX) / STREAMING_SECTOR_SIZE);
  const row = Math.floor((z - WORLD_BOUNDS.minZ) / STREAMING_SECTOR_SIZE);
  return `${col}:${row}`;
}

function labelSprite(text: string) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.width = 384;
  canvas.height = 96;
  context.fillStyle = 'rgba(13, 14, 16, 0.8)';
  context.fillRect(0, 0, 384, 96);
  context.strokeStyle = 'rgba(240, 198, 94, 0.35)';
  context.strokeRect(3, 3, 378, 90);
  context.fillStyle = '#F6E8B8';
  context.font = '700 34px Rajdhani, sans-serif';
  context.textAlign = 'center';
  context.fillText(text, 192, 58);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(12, 3, 1);
  return sprite;
}

export class LandmarkSystem {
  public readonly sectorGroups = new Map<string, THREE.Group>();

  constructor(layout: WorldLayout, private readonly terrain: TerrainSystem) {
    layout.landmarks.forEach((landmark) => this.getSectorGroup(landmark.center).add(this.createLandmark(landmark)));
  }

  public getGroups(): THREE.Group[] {
    return [...this.sectorGroups.values()];
  }

  private getSectorGroup(center: { x: number; z: number }) {
    const key = sectorKey(center.x, center.z);
    const existing = this.sectorGroups.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    group.name = `landmark-sector-${key}`;
    group.userData.streamKey = key;
    this.sectorGroups.set(key, group);
    return group;
  }

  private createLandmark(landmark: WorldLayout['landmarks'][number]): THREE.Group {
    const group = new THREE.Group();
    const baseHeight = this.terrain.getHeight(landmark.center.x, landmark.center.z);
    group.position.set(landmark.center.x, baseHeight, landmark.center.z);

    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 5, 8),
      new THREE.MeshStandardMaterial({ color: landmark.landmarkType === 'dam' ? '#D1A04A' : '#B6B6B6' }),
    );
    marker.position.y = 2.5;
    marker.castShadow = true;
    group.add(marker);

    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.4, 4),
      new THREE.MeshBasicMaterial({ color: landmark.landmarkType === 'ridge' ? '#8AD1A7' : '#F6C86B' }),
    );
    beacon.position.y = 5.8;
    group.add(beacon);

    const sprite = labelSprite(landmark.label);
    sprite.position.y = 8;
    group.add(sprite);
    return group;
  }
}
