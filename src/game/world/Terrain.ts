import * as THREE from 'three';
import { TERRAIN_COLORS, WORLD_BOUNDS } from '../config/mapConfig';
import { clamp, pointInPolygon } from '../utils/coord';
import type { MapFeatureLayer, TerrainLayerName, Vec2, WorldLayout } from './types';
import { sampleWorldHeight } from './validation';

const COLOR = {
  cultivated: new THREE.Color(TERRAIN_COLORS.cultivatedGreen),
  darkCrop: new THREE.Color(TERRAIN_COLORS.darkCropGreen),
  dry: new THREE.Color(TERRAIN_COLORS.dryBrown),
  soil: new THREE.Color(TERRAIN_COLORS.lightDrySoil),
  muddy: new THREE.Color(TERRAIN_COLORS.muddyBank),
  rocky: new THREE.Color(TERRAIN_COLORS.rockyGrey),
};

export class TerrainSystem {
  public readonly mesh: THREE.Mesh;
  public readonly waterMesh: THREE.Mesh;
  public readonly waterLevel = 2.5;

  constructor(private readonly layout: WorldLayout) {
    const size = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
    const geometry = new THREE.PlaneGeometry(size, size, 220, 220);
    const colors: number[] = [];
    const position = geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getY(i);
      const world = { x, z };
      const height = this.getHeight(world.x, world.z);
      position.setZ(i, height);
      const color = this.getTerrainColor(world, height);
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const satelliteTexture = this.createSatelliteTexture();
    satelliteTexture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      map: satelliteTexture,
      vertexColors: true,
      roughness: 0.98,
      metalness: 0.01,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';

    const waterShape = new THREE.Shape(
      (this.layout.zoneSeeds.find((zone) => zone.id === 'damLake')?.polygon ?? []).map((point, index) =>
        index === 0 ? new THREE.Vector2(point.x, point.z) : new THREE.Vector2(point.x, point.z),
      ),
    );
    const waterGeometry = new THREE.ShapeGeometry(waterShape);
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: TERRAIN_COLORS.deepWater,
      transparent: true,
      opacity: 0.9,
      roughness: 0.18,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = this.waterLevel;
    this.waterMesh.receiveShadow = true;
    this.waterMesh.name = 'water';
  }

  public getHeight(x: number, z: number): number {
    return sampleWorldHeight(this.layout, { x, z });
  }

  public isWater(x: number, z: number): boolean {
    const dam = this.layout.zoneSeeds.find((zone) => zone.id === 'damLake');
    if (!dam?.polygon) return false;
    return pointInPolygon({ x, z }, dam.polygon) && this.getHeight(x, z) < this.waterLevel;
  }

  public sampleMask(name: TerrainLayerName, x: number, z: number): number {
    const mask = this.layout.terrainMasks.find((candidate) => candidate.name === name);
    if (!mask) return 0;
    const u = clamp((x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX), 0, 1);
    const v = clamp((z - WORLD_BOUNDS.minZ) / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ), 0, 1);
    const col = Math.round(u * (mask.width - 1));
    const row = Math.round(v * (mask.height - 1));
    return mask.values[row * mask.width + col];
  }

  private getTerrainColor(point: Vec2, height: number): THREE.Color {
    const farmland = this.sampleMask('farmlandRoll', point.x, point.z);
    const ridge = this.sampleMask('southRidgeMass', point.x, point.z) + this.sampleMask('eastRidgeMass', point.x, point.z);
    const basin = this.sampleMask('damBasin', point.x, point.z);
    const bund = this.sampleMask('bundLines', point.x, point.z);
    const color = new THREE.Color();

    if (this.isWater(point.x, point.z)) {
      return new THREE.Color(basin > 7 ? TERRAIN_COLORS.deepWater : TERRAIN_COLORS.shallowWater);
    }

    if (ridge > 9) {
      color.copy(COLOR.rocky).lerp(COLOR.darkCrop, 0.22);
    } else if (basin > 4) {
      color.copy(COLOR.muddy).lerp(COLOR.soil, 0.3);
    } else if (farmland > 0.05) {
      color.copy(COLOR.cultivated).lerp(COLOR.darkCrop, clamp(0.28 + Math.abs(farmland) * 0.38 + bund * 0.2, 0, 1));
    } else {
      color.copy(COLOR.cultivated).lerp(COLOR.soil, 0.34);
    }

    if (height > 18) color.lerp(COLOR.rocky, 0.28);
    return color;
  }

  private createSatelliteTexture() {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#506235';
    ctx.fillRect(0, 0, size, size);

    this.layout.sectorCells.forEach((cell, index) => {
      const x = ((cell.center.x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)) * size;
      const y = ((cell.center.z - WORLD_BOUNDS.minZ) / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ)) * size;
      const w = (250 / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)) * size;
      const h = (250 / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ)) * size;
      if (cell.purpose === 'agriOpen') {
        const colors = ['#476133', '#5B733C', '#708749', '#8A7F54'];
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      } else if (cell.purpose === 'ridgeWild') {
        ctx.fillStyle = '#59614B';
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      }
    });

    this.layout.mapFeatures.forEach((feature) => {
      this.paintFeature(ctx, feature, size);
    });

    for (let i = 0; i < 1800; i += 1) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const alpha = 0.03 + Math.random() * 0.035;
      ctx.fillStyle = `rgba(20, 30, 18, ${alpha.toFixed(3)})`;
      ctx.fillRect(px, py, 3 + Math.random() * 4, 3 + Math.random() * 4);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  private paintFeature(ctx: CanvasRenderingContext2D, feature: MapFeatureLayer, size: number) {
    const toCanvas = (point: Vec2) => ({
      x: ((point.x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)) * size,
      y: ((point.z - WORLD_BOUNDS.minZ) / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ)) * size,
    });

    if (feature.geometry.type === 'rect') {
      const center = toCanvas(feature.geometry.center);
      const width = (feature.geometry.width / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)) * size;
      const height = (feature.geometry.height / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ)) * size;
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(feature.geometry.rotation);
      ctx.fillStyle = '#627742';
      ctx.globalAlpha = 0.2;
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    if (feature.geometry.type === 'point') return;

    const points = feature.geometry.points.map(toCanvas);
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));

    if (feature.kind === 'roads') {
      ctx.strokeStyle = '#7A7768';
      ctx.lineWidth = Number(feature.style?.width ?? 4) * 0.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#9B937D';
      ctx.lineWidth = Math.max(1.8, Number(feature.style?.width ?? 4) * 0.35);
      ctx.stroke();
      return;
    }

    ctx.closePath();
    if (feature.kind === 'builtup') {
      ctx.fillStyle = '#C0B6A5';
      ctx.fill();
      ctx.strokeStyle = '#9E907C';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (feature.kind === 'water') {
      ctx.fillStyle = '#244751';
      ctx.fill();
      ctx.strokeStyle = '#4F7C81';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (feature.kind === 'ridge') {
      ctx.fillStyle = 'rgba(96, 102, 83, 0.44)';
      ctx.fill();
    } else if (feature.kind === 'fields') {
      ctx.fillStyle = 'rgba(102, 130, 70, 0.16)';
      ctx.fill();
    }
  }
}
