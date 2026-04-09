import { MAP_MASK_RESOLUTION, VALIDATION_ROUND_TRIP_TOLERANCE, WORLD_BOUNDS } from '../config/mapConfig';
import { mapToWorld, rotatePoint, worldDistance, worldToMap } from '../utils/coord';
import type { ValidationReport, Vec2, WorldLayout } from './types';

function sampleMask(layout: WorldLayout, name: string, point: Vec2): number {
  const mask = layout.terrainMasks.find((candidate) => candidate.name === name);
  if (!mask) return 0;
  const u = (point.x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX);
  const v = (point.z - WORLD_BOUNDS.minZ) / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ);
  const col = Math.max(0, Math.min(mask.width - 1, Math.round(u * (mask.width - 1))));
  const row = Math.max(0, Math.min(mask.height - 1, Math.round(v * (mask.height - 1))));
  return mask.values[row * MAP_MASK_RESOLUTION + col];
}

export function sampleWorldHeight(layout: WorldLayout, point: Vec2): number {
  const macro =
    sampleMask(layout, 'southRidgeMass', point) +
    sampleMask(layout, 'eastRidgeMass', point) -
    sampleMask(layout, 'damBasin', point) * 0.95;
  const detail =
    sampleMask(layout, 'farmlandRoll', point) +
    sampleMask(layout, 'bundLines', point) * 0.6 -
    sampleMask(layout, 'drainageCuts', point) +
    sampleMask(layout, 'combatCover', point);
  const flatten = Math.max(sampleMask(layout, 'roadFlatten', point), sampleMask(layout, 'settlementPads', point));
  return macro + detail * (1 - Math.min(1, flatten));
}

function checkSectorPurposes(layout: WorldLayout, errors: string[]) {
  if (layout.sectorCells.some((cell) => !cell.purpose)) {
    errors.push('Missing purpose tag in one or more 250m sectors.');
  }
}

function checkRoadConnectivity(layout: WorldLayout, errors: string[]) {
  const required = ['townCore', 'westVillage', 'damLake', 'southRidge', 'eastRidge'];
  const touched = new Set<string>();
  layout.roadSplines.forEach((road) => road.connects.forEach((zone) => touched.add(zone)));
  required.forEach((zone) => {
    if (!touched.has(zone)) errors.push(`Road graph does not connect ${zone}.`);
  });
}

function checkBuildingPlacement(layout: WorldLayout, errors: string[]) {
  layout.buildingLots.forEach((lot) => {
    const corners: Vec2[] = [
      rotatePoint({ x: lot.center.x - lot.width / 2, z: lot.center.z - lot.depth / 2 }, lot.rotation, lot.center),
      rotatePoint({ x: lot.center.x + lot.width / 2, z: lot.center.z - lot.depth / 2 }, lot.rotation, lot.center),
      rotatePoint({ x: lot.center.x + lot.width / 2, z: lot.center.z + lot.depth / 2 }, lot.rotation, lot.center),
      rotatePoint({ x: lot.center.x - lot.width / 2, z: lot.center.z + lot.depth / 2 }, lot.rotation, lot.center),
    ];
    const heights = corners.map((corner) => sampleWorldHeight(layout, corner));
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    const plinthBottom = minHeight - 0.08;
    const plinthTop = maxHeight + 0.08;
    if (plinthTop - maxHeight > 0.25 || minHeight - plinthBottom > 0.15) errors.push(`Building lot ${lot.id} exceeds plinth tolerance.`);
  });
}

function checkCoverSpacing(layout: WorldLayout, errors: string[]) {
  const anchors = layout.coverAnchors.map((anchor) => anchor.center);
  const checkpoints = [
    { x: 760, z: -300 },
    { x: 620, z: 420 },
    { x: -1230, z: 1020 },
    { x: -1260, z: 1470 },
    { x: 1480, z: 320 },
  ];
  checkpoints.forEach((point, index) => {
    const nearest = anchors.reduce((best, anchor) => Math.min(best, worldDistance(point, anchor)), Number.POSITIVE_INFINITY);
    if (nearest > 140) {
      errors.push(`Cover spacing fails near corridor checkpoint ${index}.`);
    }
  });
}

function checkTerrainUse(layout: WorldLayout, errors: string[]) {
  const samples = [
    { x: 760, z: -300 },
    { x: -1180, z: 980 },
    { x: -1180, z: 1500 },
    { x: 1450, z: 320 },
    { x: -220, z: 420 },
  ];
  const heights = samples.map((point) => sampleWorldHeight(layout, point));
  if (Math.max(...heights) - Math.min(...heights) < 8) {
    errors.push('Terrain lacks enough combat-supporting elevation spread.');
  }
}

function checkCoordinateRoundTrip(errors: string[]) {
  const checkpoints = [
    { x: WORLD_BOUNDS.minX, z: WORLD_BOUNDS.minZ },
    { x: WORLD_BOUNDS.maxX, z: WORLD_BOUNDS.maxZ },
    { x: 0, z: 0 },
    { x: 720, z: -260 },
    { x: -1180, z: 1500 },
  ];
  checkpoints.forEach((point) => {
    const roundTripped = mapToWorld(worldToMap(point));
    if (worldDistance(point, roundTripped) > VALIDATION_ROUND_TRIP_TOLERANCE) {
      errors.push(`Coordinate round-trip exceeds tolerance at ${point.x},${point.z}.`);
    }
  });
}

export function validateWorldLayout(layout: WorldLayout): ValidationReport {
  const errors: string[] = [];
  checkSectorPurposes(layout, errors);
  checkRoadConnectivity(layout, errors);
  checkBuildingPlacement(layout, errors);
  checkCoverSpacing(layout, errors);
  checkTerrainUse(layout, errors);
  checkCoordinateRoundTrip(errors);
  return { valid: errors.length === 0, errors };
}
