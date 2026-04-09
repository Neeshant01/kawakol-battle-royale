import * as THREE from 'three';
import { Engine } from './Engine';
import { BuildingSystem } from './world/Buildings';
import { buildWorldLayout } from './world/layout';
import { LandmarkSystem } from './world/Landmarks';
import { MapSystem } from './world/MapSystem';
import { PropSystem } from './world/Props';
import { RoadSystem } from './world/Roads';
import { TerrainSystem } from './world/Terrain';
import type { ValidationReport, WorldLayout } from './world/types';
import { validateWorldLayout } from './world/validation';

type LootItem = {
  id: string;
  type: 'AR' | 'Sniper' | 'SMG' | 'Shotgun' | 'Medkit' | 'Ammo';
  x: number;
  z: number;
};

export class World {
  public readonly layout: WorldLayout;
  public readonly validationReport: ValidationReport;
  public readonly terrain: TerrainSystem;
  public readonly mapSystem: MapSystem;
  private readonly roadSystem: RoadSystem;
  private readonly buildingSystem: BuildingSystem;
  private readonly propSystem: PropSystem;
  private readonly landmarkSystem: LandmarkSystem;
  private readonly dynamicGroup = new THREE.Group();
  private readonly zoneRing: THREE.Mesh;
  private readonly zoneColumn: THREE.Mesh;
  private readonly lootMeshes = new Map<string, THREE.Mesh>();
  private readonly sectorGroups = new Map<string, THREE.Group>();
  private activeStreamingKey = '';

  constructor(private readonly engine: Engine) {
    this.layout = buildWorldLayout();
    this.validationReport = validateWorldLayout(this.layout);
    if (!this.validationReport.valid) {
      throw new Error(`World layout validation failed:\n${this.validationReport.errors.join('\n')}`);
    }

    this.terrain = new TerrainSystem(this.layout);
    this.roadSystem = new RoadSystem(this.layout.roadSplines, this.terrain);
    this.buildingSystem = new BuildingSystem(this.layout, this.terrain);
    this.propSystem = new PropSystem(this.layout, this.terrain);
    this.landmarkSystem = new LandmarkSystem(this.layout, this.terrain);
    this.mapSystem = new MapSystem(this.layout);

    this.engine.scene.add(this.terrain.mesh, this.terrain.waterMesh, this.roadSystem.group, this.dynamicGroup);

    [...this.buildingSystem.getGroups(), ...this.propSystem.getGroups(), ...this.landmarkSystem.getGroups()].forEach((group) => {
      this.sectorGroups.set(group.name, group);
      this.engine.scene.add(group);
      group.visible = false;
    });

    this.zoneRing = new THREE.Mesh(
      new THREE.RingGeometry(498, 500, 96),
      new THREE.MeshBasicMaterial({
        color: 0x79a7ff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    this.zoneRing.rotation.x = -Math.PI / 2;
    this.zoneRing.position.y = 0.35;

    this.zoneColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(500, 500, 80, 64, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x79a7ff,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    this.zoneColumn.position.y = 40;

    this.dynamicGroup.add(this.zoneRing, this.zoneColumn);
  }

  public getHeight(x: number, z: number) {
    return this.terrain.getHeight(x, z);
  }

  public isWater(x: number, z: number) {
    return this.terrain.isWater(x, z);
  }

  public getMapSystem() {
    return this.mapSystem;
  }

  public getCameraCollisionObjects() {
    return this.buildingSystem.collisionMeshes;
  }

  public updateStreaming(position: THREE.Vector3) {
    const playerCol = Math.floor((position.x - this.layout.bounds.minX) / 500);
    const playerRow = Math.floor((position.z - this.layout.bounds.minZ) / 500);
    const key = `${playerCol}:${playerRow}`;
    if (key === this.activeStreamingKey) return;
    this.activeStreamingKey = key;

    this.sectorGroups.forEach((group) => {
      const [col, row] = String(group.userData.streamKey ?? '0:0').split(':').map(Number);
      group.visible = Math.abs((col ?? 0) - playerCol) <= 2 && Math.abs((row ?? 0) - playerRow) <= 2;
    });
  }

  public updateZone(zone: { x: number; z: number; radius: number }) {
    this.zoneRing.position.set(zone.x, 0.35, zone.z);
    this.zoneColumn.position.set(zone.x, 40, zone.z);
    const scale = zone.radius / 500;
    this.zoneRing.scale.setScalar(scale);
    this.zoneColumn.scale.set(scale, 1, scale);
  }

  public updateLoot(loot: LootItem[]) {
    this.lootMeshes.forEach((mesh, id) => {
      if (!loot.find((item) => item.id === id)) {
        this.dynamicGroup.remove(mesh);
        this.lootMeshes.delete(id);
      }
    });

    loot.forEach((item) => {
      if (this.lootMeshes.has(item.id)) return;
      const color =
        item.type === 'Medkit'
          ? 0x6cd377
          : item.type === 'Ammo'
            ? 0xdbc26b
            : item.type === 'Sniper'
              ? 0xbf5f53
              : 0xd98a54;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.35, 1.8),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.15,
          roughness: 0.85,
        }),
      );
      mesh.position.set(item.x, this.getHeight(item.x, item.z) + 0.4, item.z);
      mesh.castShadow = true;
      this.dynamicGroup.add(mesh);
      this.lootMeshes.set(item.id, mesh);
    });
  }
}
