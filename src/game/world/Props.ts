import * as THREE from 'three';
import { STREAMING_SECTOR_SIZE, WORLD_BOUNDS } from '../config/mapConfig';
import type { PropSeed, WorldLayout } from './types';
import { TerrainSystem } from './Terrain';

function sectorKey(x: number, z: number) {
  const col = Math.floor((x - WORLD_BOUNDS.minX) / STREAMING_SECTOR_SIZE);
  const row = Math.floor((z - WORLD_BOUNDS.minZ) / STREAMING_SECTOR_SIZE);
  return `${col}:${row}`;
}

function material(color: number | string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02 });
}

export class PropSystem {
  public readonly sectorGroups = new Map<string, THREE.Group>();

  constructor(layout: WorldLayout, private readonly terrain: TerrainSystem) {
    layout.propSeeds.forEach((prop) => this.getSectorGroup(prop.center).add(this.createProp(prop)));
  }

  public getGroups(): THREE.Group[] {
    return [...this.sectorGroups.values()];
  }

  private getSectorGroup(center: { x: number; z: number }) {
    const key = sectorKey(center.x, center.z);
    const existing = this.sectorGroups.get(key);
    if (existing) return existing;
    const group = new THREE.Group();
    group.name = `prop-sector-${key}`;
    group.userData.streamKey = key;
    this.sectorGroups.set(key, group);
    return group;
  }

  private createProp(prop: PropSeed): THREE.Object3D {
    const baseHeight = this.terrain.getHeight(prop.center.x, prop.center.z);
    const group = new THREE.Group();
    group.position.set(prop.center.x, baseHeight, prop.center.z);
    group.rotation.y = prop.rotation;
    group.scale.setScalar(prop.scale);

    const addMesh = (mesh: THREE.Mesh, y = 0) => {
      mesh.position.y += y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    switch (prop.kind) {
      case 'tree': {
        addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.8, 6), material('#5b4330')), 1.9);
        addMesh(new THREE.Mesh(new THREE.SphereGeometry(1.55, 7, 7), material(prop.zoneId === 'southRidge' ? '#5e6d38' : '#556b2f')), 4.3);
        break;
      }
      case 'bush':
        addMesh(new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), material('#707642')), 0.8);
        break;
      case 'rock':
        addMesh(new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), material('#72685d')), 0.8);
        break;
      case 'pole':
        addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 6.5, 6), material('#5c564d')), 3.25);
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), material('#5c564d')), 6.1);
        break;
      case 'wall':
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.3, 0.35), material('#8d7f6a')), 0.65);
        break;
      case 'crate':
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), material('#78573b')), 0.4);
        break;
      case 'bench':
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.45), material('#6d5134')), 0.7);
        break;
      case 'pump':
        addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8), material('#3a7b87')), 0.6);
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.12), material('#3a7b87')), 1.0);
        break;
      case 'sign':
        addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), material('#5a4f44')), 1.1);
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.08), material('#8a6e3a')), 1.8);
        break;
      case 'culvert':
        addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 10, 1, true), material('#7a7368')), 0.45);
        break;
      case 'fence':
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.2), material('#7e7a71')), 0.45);
        break;
      case 'shed':
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.2, 2.4), material('#b8ac96')), 1.1);
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 2.7), material('#72746f')), 2.35);
        break;
      case 'debris':
      default:
        addMesh(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.7), material('#75644f')), 0.15);
        break;
    }

    group.name = prop.id;
    return group;
  }
}
