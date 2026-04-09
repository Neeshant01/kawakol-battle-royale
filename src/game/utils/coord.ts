import { WORLD_BOUNDS } from '../config/mapConfig';
import type { Vec2 } from '../world/types';

export interface NormalizedPoint {
  u: number;
  v: number;
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function worldToMap(point: Vec2, bounds = WORLD_BOUNDS): NormalizedPoint {
  return {
    u: (point.x - bounds.minX) / (bounds.maxX - bounds.minX),
    v: 1 - (point.z - bounds.minZ) / (bounds.maxZ - bounds.minZ),
  };
}

export function mapToWorld(point: NormalizedPoint, bounds = WORLD_BOUNDS): Vec2 {
  return {
    x: bounds.minX + point.u * (bounds.maxX - bounds.minX),
    z: bounds.minZ + (1 - point.v) * (bounds.maxZ - bounds.minZ),
  };
}

export function clampToMap(point: NormalizedPoint): NormalizedPoint {
  return { u: clamp(point.u, 0, 1), v: clamp(point.v, 0, 1) };
}

export function zoneToMapRadius(radius: number, bounds = WORLD_BOUNDS): number {
  return radius / Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
}

export function worldDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

export function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const denom = abx * abx + abz * abz || 1;
  const t = clamp(((point.x - a.x) * abx + (point.z - a.z) * abz) / denom, 0, 1);
  const projX = a.x + abx * t;
  const projZ = a.z + abz * t;
  return Math.hypot(point.x - projX, point.z - projZ);
}

export function distanceToPolyline(point: Vec2, points: Vec2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i += 1) {
    best = Math.min(best, distanceToSegment(point, points[i], points[i + 1]));
  }
  return best;
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersect =
      zi > point.z !== zj > point.z &&
      point.x < ((xj - xi) * (point.z - zi)) / ((zj - zi) || 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function rotatePoint(point: Vec2, angle: number, origin: Vec2): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  return {
    x: origin.x + dx * c - dz * s,
    z: origin.z + dx * s + dz * c,
  };
}

export function hashNoise(x: number, z: number, seed = 1): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + seed * 37.719) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
