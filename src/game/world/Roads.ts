import * as THREE from 'three';
import type { RoadSpline } from './types';
import { TerrainSystem } from './Terrain';

function buildRoadStrip(points: THREE.Vector3[], width: number, color: number, yOffset: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  points.forEach((point, index) => {
    const prev = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];
    const tangent = next.clone().sub(prev).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
    const left = point.clone().add(normal);
    const right = point.clone().sub(normal);
    vertices.push(left.x, point.y + yOffset, left.z, right.x, point.y + yOffset, right.z);
    uvs.push(0, index / Math.max(points.length - 1, 1), 1, index / Math.max(points.length - 1, 1));
  });

  for (let i = 0; i < points.length - 1; i += 1) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
}

export class RoadSystem {
  public readonly group = new THREE.Group();

  constructor(roads: RoadSpline[], private readonly terrain: TerrainSystem) {
    roads.forEach((road) => this.group.add(this.createRoadMesh(road)));
    this.group.name = 'roads';
  }

  private createRoadMesh(road: RoadSpline): THREE.Group {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(road.controlPoints.map((point) => new THREE.Vector3(point.x, 0, point.z)));
    const samples = curve.getPoints(Math.max(road.controlPoints.length * 10, 24));
    const terrainPoints = samples.map((point) => new THREE.Vector3(point.x, this.terrain.getHeight(point.x, point.z), point.z));

    const shoulderColor = road.surface === 'asphalt' ? 0x5b554c : road.surface === 'worn' ? 0x6e6558 : 0x8a7552;
    const laneColor = road.surface === 'asphalt' ? 0x353432 : road.surface === 'worn' ? 0x5d5548 : 0x7d6c4e;

    const shoulder = buildRoadStrip(terrainPoints, road.width + road.shoulder * 2, shoulderColor, 0.05);
    const roadMesh = buildRoadStrip(terrainPoints, road.width, laneColor, 0.08);
    shoulder.receiveShadow = true;
    roadMesh.receiveShadow = true;
    group.add(shoulder, roadMesh);
    group.name = road.id;
    return group;
  }
}
