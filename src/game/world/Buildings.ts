import * as THREE from 'three';
import { BUILDING_COLORS, STREAMING_SECTOR_SIZE, WORLD_BOUNDS } from '../config/mapConfig';
import type { BuildingLot, WorldLayout } from './types';
import { TerrainSystem } from './Terrain';
import { rotatePoint } from '../utils/coord';

const PALETTE = [
  BUILDING_COLORS.cementWhite,
  BUILDING_COLORS.dustyBeige,
  BUILDING_COLORS.fadedLimeWash,
  BUILDING_COLORS.dustyPink,
];

function material(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 });
}

function sectorKey(x: number, z: number) {
  const col = Math.floor((x - WORLD_BOUNDS.minX) / STREAMING_SECTOR_SIZE);
  const row = Math.floor((z - WORLD_BOUNDS.minZ) / STREAMING_SECTOR_SIZE);
  return `${col}:${row}`;
}

export class BuildingSystem {
  public readonly sectorGroups = new Map<string, THREE.Group>();
  public readonly collisionMeshes: THREE.Object3D[] = [];

  constructor(private readonly layout: WorldLayout, private readonly terrain: TerrainSystem) {
    layout.buildingLots.forEach((lot, index) => {
      const mesh = this.createBuilding(lot, index);
      this.getSectorGroup(lot.center).add(mesh);
    });
  }

  public getGroups(): THREE.Group[] {
    return [...this.sectorGroups.values()];
  }

  private getSectorGroup(center: { x: number; z: number }): THREE.Group {
    const key = sectorKey(center.x, center.z);
    const existing = this.sectorGroups.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    group.name = `sector-${key}`;
    group.userData.streamKey = key;
    this.sectorGroups.set(key, group);
    return group;
  }

  private createBuilding(lot: BuildingLot, index: number): THREE.Group {
    const group = new THREE.Group();
    const corners = [
      rotatePoint({ x: lot.center.x - lot.width / 2, z: lot.center.z - lot.depth / 2 }, lot.rotation, lot.center),
      rotatePoint({ x: lot.center.x + lot.width / 2, z: lot.center.z - lot.depth / 2 }, lot.rotation, lot.center),
      rotatePoint({ x: lot.center.x + lot.width / 2, z: lot.center.z + lot.depth / 2 }, lot.rotation, lot.center),
      rotatePoint({ x: lot.center.x - lot.width / 2, z: lot.center.z + lot.depth / 2 }, lot.rotation, lot.center),
    ];
    const cornerHeights = corners.map((corner) => this.terrain.getHeight(corner.x, corner.z));
    const minHeight = Math.min(...cornerHeights);
    const maxHeight = Math.max(...cornerHeights);
    const plinthBottom = minHeight - 0.08;
    const floors = lot.lotType === 'house2' || lot.lotType === 'shop' ? (lot.enterable ? 2 : 1 + (index % 2)) : 1;
    const floorHeight = 3.1;
    const bodyHeight = floors * floorHeight;
    const wallColor = PALETTE[index % PALETTE.length];
    const plinthTop = maxHeight + 0.08;
    const plinthDepth = Math.max(1.45, plinthTop - plinthBottom);
    const width = lot.width;
    const depth = lot.depth;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 1.1, plinthDepth, depth + 1.1), material('#6a5d4a'));
    plinth.position.y = plinthDepth / 2;
    plinth.receiveShadow = true;
    group.add(plinth);

    const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(width, bodyHeight, depth), material(wallColor));
    mainBlock.position.y = plinthDepth + bodyHeight / 2;
    mainBlock.castShadow = true;
    mainBlock.receiveShadow = true;
    group.add(mainBlock);
    this.collisionMeshes.push(mainBlock);

    if (lot.lotType === 'compound') {
      const annex = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, floorHeight * 0.9, depth * 0.5), material(PALETTE[(index + 1) % PALETTE.length]));
      annex.position.set(width * 0.28, plinthDepth + floorHeight * 0.45, -depth * 0.32);
      annex.castShadow = true;
      annex.receiveShadow = true;
      group.add(annex);
    }

    if (lot.lotType === 'shop') {
      const awning = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, 0.15, depth * 0.22), material(BUILDING_COLORS.roofTin));
      awning.position.set(0, plinthDepth + floorHeight * 0.95, depth * 0.53);
      group.add(awning);

      const shutter = new THREE.Mesh(new THREE.BoxGeometry(width * 0.58, floorHeight * 0.8, 0.18), material(BUILDING_COLORS.shutterMetal));
      shutter.position.set(0, plinthDepth + floorHeight * 0.45, depth * 0.52);
      group.add(shutter);
    } else {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.16), material(BUILDING_COLORS.brickAccent));
      door.position.set(0, plinthDepth + 1.05, depth * 0.51);
      group.add(door);
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.4, lot.lotType === 'shed' ? 0.22 : 0.28, depth + 0.4),
      material(lot.lotType === 'shed' ? BUILDING_COLORS.roofTin : '#8f877d'),
    );
    roof.position.y = plinthDepth + bodyHeight + 0.14;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    if (lot.lotType !== 'shed') {
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.65, depth + 0.7), material('#b7afa2'));
      parapet.position.y = plinthDepth + bodyHeight + 0.48;
      group.add(parapet);

      const roofCut = new THREE.Mesh(new THREE.BoxGeometry(width - 0.9, 0.7, depth - 0.9), material(wallColor));
      roofCut.position.y = plinthDepth + bodyHeight + 0.44;
      group.add(roofCut);
    }

    if (lot.enterable || lot.roofAccess) {
      const stairHeight = floors > 1 ? floorHeight * 2 : floorHeight;
      const stair = new THREE.Mesh(new THREE.BoxGeometry(1.8, stairHeight, 2.4), material('#bbb1a3'));
      stair.position.set(-width * 0.52, plinthDepth + stairHeight / 2, -depth * 0.15);
      stair.castShadow = true;
      stair.receiveShadow = true;
      group.add(stair);
      this.collisionMeshes.push(stair);
    }

    if (lot.zoneId !== 'townCore') {
      const wallGroup = new THREE.Group();
      const wallMaterial = material('#8d7f6a');
      [
        { w: width + 4, d: 0.35, x: 0, z: depth * 0.78 },
        { w: width + 4, d: 0.35, x: 0, z: -depth * 0.78 },
        { w: 0.35, d: depth + 3.4, x: width * 0.72, z: 0 },
        { w: 0.35, d: depth + 3.4, x: -width * 0.72, z: 0 },
      ].forEach((segment) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(segment.w, 1.4, segment.d), wallMaterial);
        wall.position.set(segment.x, 0.7, segment.z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wallGroup.add(wall);
        this.collisionMeshes.push(wall);
      });
      group.add(wallGroup);
    }

    group.position.set(lot.center.x, plinthBottom, lot.center.z);
    group.rotation.y = lot.rotation;
    group.name = lot.id;
    return group;
  }
}
