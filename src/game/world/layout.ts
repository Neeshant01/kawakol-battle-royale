import {
  FIELD_TRACKS,
  MACRO_ZONES,
  MAP_MASK_RESOLUTION,
  SECTOR_SIZE,
  WORLD_BOUNDS,
  WORLD_LAYOUT_ORDER,
} from '../config/mapConfig';
import {
  clamp,
  distanceToPolyline,
  hashNoise,
  lerp,
  pointInPolygon,
  rotatePoint,
  smoothstep,
  worldDistance,
} from '../utils/coord';
import type {
  BuildingLot,
  CoverAnchor,
  LandmarkDef,
  MacroZone,
  MapFeatureLayer,
  PropSeed,
  RoadSpline,
  SectorCell,
  SettlementSeed,
  TerrainLayerName,
  TerrainMask,
  Vec2,
  WorldLayout,
  ZoneId,
} from './types';

const LAYER_ORDER: TerrainLayerName[] = [
  'farmlandRoll',
  'southRidgeMass',
  'eastRidgeMass',
  'damBasin',
  'settlementPads',
  'roadFlatten',
  'bundLines',
  'drainageCuts',
  'combatCover',
];

type MaskMap = Record<TerrainLayerName, TerrainMask>;

const ROAD_SEED = 29;
const PROP_SEED = 71;
const BUILDING_SEED = 113;

function makeMask(name: TerrainLayerName, blend: TerrainMask['blend'], weight: number): TerrainMask {
  return {
    name,
    width: MAP_MASK_RESOLUTION,
    height: MAP_MASK_RESOLUTION,
    blend,
    weight,
    values: new Float32Array(MAP_MASK_RESOLUTION * MAP_MASK_RESOLUTION),
  };
}

function createTerrainMasks(): MaskMap {
  return {
    farmlandRoll: makeMask('farmlandRoll', 'add', 1),
    southRidgeMass: makeMask('southRidgeMass', 'add', 1),
    eastRidgeMass: makeMask('eastRidgeMass', 'add', 1),
    damBasin: makeMask('damBasin', 'subtract', 1),
    settlementPads: makeMask('settlementPads', 'max', 1),
    roadFlatten: makeMask('roadFlatten', 'max', 1),
    bundLines: makeMask('bundLines', 'add', 1),
    drainageCuts: makeMask('drainageCuts', 'subtract', 1),
    combatCover: makeMask('combatCover', 'add', 1),
  };
}

function indexFor(col: number, row: number) {
  return row * MAP_MASK_RESOLUTION + col;
}

function eachCell(callback: (col: number, row: number, world: Vec2) => void) {
  for (let row = 0; row < MAP_MASK_RESOLUTION; row += 1) {
    for (let col = 0; col < MAP_MASK_RESOLUTION; col += 1) {
      const u = col / (MAP_MASK_RESOLUTION - 1);
      const v = row / (MAP_MASK_RESOLUTION - 1);
      callback(col, row, {
        x: lerp(WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX, u),
        z: lerp(WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ, v),
      });
    }
  }
}

function zoneById(id: ZoneId): MacroZone {
  const zone = MACRO_ZONES.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`Unknown zone ${id}`);
  return zone;
}

function ellipseFalloff(point: Vec2, zone: MacroZone): number {
  const dx = (point.x - zone.center.x) / zone.extent.x;
  const dz = (point.z - zone.center.z) / zone.extent.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return clamp(1 - d, 0, 1);
}

function splineBandFalloff(point: Vec2, zone: MacroZone): number {
  const spline = zone.spline ?? [];
  const width = zone.bandWidth ?? 1;
  return clamp(1 - distanceToPolyline(point, spline) / width, 0, 1);
}

function zoneInfluence(point: Vec2, zone: MacroZone): number {
  if (zone.shape === 'ellipse') return ellipseFalloff(point, zone);
  if (zone.shape === 'polygon' && zone.polygon) return pointInPolygon(point, zone.polygon) ? 1 : 0;
  if (zone.shape === 'splineBand') return splineBandFalloff(point, zone);
  return 0;
}

function generateBaseTerrainMasks(masks: MaskMap) {
  const southRidge = zoneById('southRidge');
  const eastRidge = zoneById('eastRidge');
  const centralFields = zoneById('centralFields');
  const damLake = zoneById('damLake');

  eachCell((col, row, point) => {
    const idx = indexFor(col, row);
    const fieldInfluence = zoneInfluence(point, centralFields);
    const northBand = clamp((1200 - point.z) / 2200, 0, 1);
    const rollA = Math.sin(point.x / 190) * Math.cos(point.z / 240);
    const rollB = Math.cos(point.x / 330 + 0.4) * Math.sin(point.z / 220);
    const rollNoise = hashNoise(point.x / 180, point.z / 220, 7) * 0.35;
    masks.farmlandRoll.values[idx] = (rollA * 1.5 + rollB * 1.1 + rollNoise) * (0.7 + fieldInfluence * 0.6) * northBand;

    const southFalloff = zoneInfluence(point, southRidge);
    const southNoise = 0.8 + hashNoise(point.x / 95, point.z / 110, 11) * 0.22;
    masks.southRidgeMass.values[idx] = southFalloff * (18 + southFalloff * 12) * southNoise;

    const eastFalloff = zoneInfluence(point, eastRidge);
    const eastNoise = 0.85 + hashNoise(point.x / 125, point.z / 130, 17) * 0.18;
    masks.eastRidgeMass.values[idx] = eastFalloff * (10 + eastFalloff * 8) * eastNoise;

    const damInfluence = zoneInfluence(point, damLake);
    const lobe1 = Math.max(0, 1 - worldDistance(point, { x: -1240, z: 1500 }) / 240);
    const lobe2 = Math.max(0, 1 - worldDistance(point, { x: -1040, z: 1450 }) / 170);
    const lobe3 = Math.max(0, 1 - worldDistance(point, { x: -1170, z: 1640 }) / 190);
    masks.damBasin.values[idx] = Math.max(damInfluence * 6, lobe1 * 10 + lobe2 * 8 + lobe3 * 6);

    const bundPattern =
      smoothstep(0.05, 1, fieldInfluence) *
      (Math.sin(point.x / 48 + 0.6 * Math.sin(point.z / 180)) * 0.45 +
        Math.cos(point.z / 62 + point.x / 310) * 0.35 +
        hashNoise(point.x / 75, point.z / 75, 23) * 0.12);
    masks.bundLines.values[idx] = bundPattern;

    const drainageA = Math.max(0, 1 - distanceToPolyline(point, [
      { x: -1450, z: 560 },
      { x: -890, z: 610 },
      { x: -420, z: 700 },
      { x: 120, z: 840 },
      { x: 720, z: 1010 },
    ]) / 95);
    const drainageB = Math.max(0, 1 - distanceToPolyline(point, [
      { x: -1360, z: 1260 },
      { x: -1160, z: 1340 },
      { x: -980, z: 1480 },
      { x: -780, z: 1670 },
    ]) / 80);
    masks.drainageCuts.values[idx] = drainageA * 1.1 + drainageB * 0.8;

    const coverA = Math.max(0, 1 - distanceToPolyline(point, [
      { x: 280, z: 470 },
      { x: -180, z: 610 },
      { x: -700, z: 760 },
    ]) / 70);
    const coverB = Math.max(0, 1 - distanceToPolyline(point, [
      { x: -920, z: 1090 },
      { x: -1110, z: 1250 },
      { x: -1180, z: 1390 },
    ]) / 65);
    const coverC = Math.max(0, 1 - distanceToPolyline(point, [
      { x: 1120, z: -40 },
      { x: 1280, z: 120 },
      { x: 1400, z: 360 },
    ]) / 60);
    masks.combatCover.values[idx] = coverA * 0.9 + coverB * 1.2 + coverC * 0.85;
  });
}

function createRoadSplines(): RoadSpline[] {
  const roads: RoadSpline[] = [
    {
      id: 'R0',
      kind: 'arterial',
      surface: 'asphalt',
      width: 14,
      shoulder: 2,
      flattenRadius: 12,
      connects: ['townCore', 'eastRidge', 'outerHamlets'],
      controlPoints: [
        { x: -2000, z: -520 },
        { x: -1450, z: -500 },
        { x: -820, z: -470 },
        { x: -120, z: -420 },
        { x: 360, z: -360 },
        { x: 760, z: -290 },
        { x: 1180, z: -250 },
        { x: 2000, z: -210 },
      ],
    },
    {
      id: 'R1',
      kind: 'secondary',
      surface: 'asphalt',
      width: 11,
      shoulder: 1.5,
      flattenRadius: 10,
      connects: ['townCore', 'centralFields', 'outerHamlets'],
      controlPoints: [
        { x: 730, z: -290 },
        { x: 680, z: 40 },
        { x: 620, z: 420 },
        { x: 860, z: 920 },
      ],
    },
    {
      id: 'R2',
      kind: 'secondary',
      surface: 'worn',
      width: 9,
      shoulder: 1.5,
      flattenRadius: 9,
      connects: ['townCore', 'westVillage', 'centralFields'],
      controlPoints: [
        { x: 620, z: 420 },
        { x: 140, z: 560 },
        { x: -420, z: 690 },
        { x: -980, z: 860 },
        { x: -1230, z: 1020 },
      ],
    },
    {
      id: 'R3',
      kind: 'secondary',
      surface: 'worn',
      width: 8,
      shoulder: 1,
      flattenRadius: 9,
      connects: ['westVillage', 'damLake', 'southRidge'],
      controlPoints: [
        { x: -1080, z: 1040 },
        { x: -1180, z: 1240 },
        { x: -1260, z: 1470 },
      ],
    },
    {
      id: 'R4',
      kind: 'secondary',
      surface: 'worn',
      width: 8,
      shoulder: 1,
      flattenRadius: 9,
      connects: ['townCore', 'eastRidge', 'outerHamlets'],
      controlPoints: [
        { x: 1120, z: -220 },
        { x: 1380, z: 20 },
        { x: 1510, z: 320 },
        { x: 1280, z: 760 },
      ],
    },
  ];

  FIELD_TRACKS.forEach((track, index) => {
    roads.push({
      id: `R5-${index}`,
      kind: 'track',
      surface: 'dirt',
      width: 3.8 + (index % 2) * 0.2,
      shoulder: 0.7,
      flattenRadius: 4.5,
      connects: index < 3 ? ['outerHamlets', 'centralFields'] : ['westVillage', 'centralFields'],
      controlPoints: track,
    });
  });

  return roads;
}

function stampRoadFlatten(masks: MaskMap, roads: RoadSpline[]) {
  eachCell((col, row, point) => {
    const idx = indexFor(col, row);
    let flatten = 0;
    for (const road of roads) {
      const influence = Math.max(
        0,
        1 - distanceToPolyline(point, road.controlPoints) / (road.flattenRadius + road.width * 0.9),
      );
      flatten = Math.max(flatten, influence);
    }
    masks.roadFlatten.values[idx] = flatten;
  });
}

function generateSettlementSeeds(): SettlementSeed[] {
  const seeds: SettlementSeed[] = [];

  const townCenters: Vec2[] = [
    { x: 530, z: -420 },
    { x: 640, z: -400 },
    { x: 780, z: -360 },
    { x: 890, z: -320 },
    { x: 960, z: -220 },
    { x: 880, z: -130 },
    { x: 740, z: -130 },
    { x: 600, z: -180 },
    { x: 560, z: -40 },
    { x: 710, z: 30 },
    { x: 880, z: 40 },
    { x: 1020, z: -40 },
  ];
  const townCounts = [7, 6, 7, 6, 6, 7, 6, 7, 6, 7, 7, 6];
  townCenters.forEach((center, index) => {
    seeds.push({
      id: `town-${index}`,
      zoneId: 'townCore',
      center,
      clusterRadius: 80 + (index % 3) * 10,
      clusterCount: 1,
      laneStyle: 'market',
      targetBuildings: townCounts[index],
    });
  });

  const westCenters: Vec2[] = [
    { x: -1340, z: 900 },
    { x: -1260, z: 1040 },
    { x: -1160, z: 930 },
    { x: -1090, z: 1050 },
    { x: -1000, z: 940 },
    { x: -1240, z: 1150 },
    { x: -1120, z: 1160 },
  ];
  const westCounts = [6, 6, 5, 6, 6, 7, 6];
  westCenters.forEach((center, index) => {
    seeds.push({
      id: `west-${index}`,
      zoneId: 'westVillage',
      center,
      clusterRadius: 92 + (index % 2) * 14,
      clusterCount: 1,
      laneStyle: 'village',
      targetBuildings: westCounts[index],
    });
  });

  [
    { id: 'hamlet-0', center: { x: -1650, z: 820 } },
    { id: 'hamlet-1', center: { x: -380, z: 180 } },
    { id: 'hamlet-2', center: { x: 1600, z: -120 } },
    { id: 'hamlet-3', center: { x: 1250, z: 1080 } },
  ].forEach((hamlet, index) => {
    seeds.push({
      id: hamlet.id,
      zoneId: 'outerHamlets',
      center: hamlet.center,
      clusterRadius: 72,
      clusterCount: 1,
      laneStyle: 'hamlet',
      targetBuildings: [6, 6, 6, 6][index],
    });
  });

  [
    { center: { x: -1320, z: 1370 }, targetBuildings: 3 },
    { center: { x: -1010, z: 1310 }, targetBuildings: 2 },
    { center: { x: -1250, z: 1600 }, targetBuildings: 3 },
  ].forEach((seed, index) => {
    seeds.push({
      id: `dam-${index}`,
      zoneId: 'damLake',
      center: seed.center,
      clusterRadius: 64,
      clusterCount: 1,
      laneStyle: 'hamlet',
      targetBuildings: seed.targetBuildings,
    });
  });

  return seeds;
}

function createLaneSplinesForSettlements(seeds: SettlementSeed[]): RoadSpline[] {
  return seeds.flatMap((seed, index) => {
    const roads: RoadSpline[] = [];
    const angleBase = hashNoise(seed.center.x / 400, seed.center.z / 400, ROAD_SEED + index) * Math.PI * 0.45;
    const primaryLength = seed.clusterRadius * 1.1;
    const primary: Vec2[] = [
      {
        x: seed.center.x - Math.cos(angleBase) * primaryLength * 0.55,
        z: seed.center.z - Math.sin(angleBase) * primaryLength * 0.55,
      },
      seed.center,
      {
        x: seed.center.x + Math.cos(angleBase) * primaryLength * 0.55,
        z: seed.center.z + Math.sin(angleBase) * primaryLength * 0.55,
      },
    ];

    roads.push({
      id: `${seed.id}-lane-a`,
      kind: 'lane',
      surface: seed.laneStyle === 'market' ? 'worn' : 'dirt',
      width: seed.laneStyle === 'market' ? 4.8 : 3.8,
      shoulder: 0.8,
      flattenRadius: 4.5,
      controlPoints: primary,
      connects: [seed.zoneId],
    });

    if (seed.targetBuildings > 5) {
      const branchAngle = angleBase + Math.PI / 2.4;
      roads.push({
        id: `${seed.id}-lane-b`,
        kind: 'lane',
        surface: seed.laneStyle === 'market' ? 'worn' : 'dirt',
        width: seed.laneStyle === 'market' ? 4 : 3.5,
        shoulder: 0.6,
        flattenRadius: 4,
        controlPoints: [
          {
            x: seed.center.x - Math.cos(branchAngle) * seed.clusterRadius * 0.35,
            z: seed.center.z - Math.sin(branchAngle) * seed.clusterRadius * 0.35,
          },
          {
            x: seed.center.x + Math.cos(branchAngle) * seed.clusterRadius * 0.25,
            z: seed.center.z + Math.sin(branchAngle) * seed.clusterRadius * 0.25,
          },
        ],
        connects: [seed.zoneId],
      });
    }

    return roads;
  });
}

function pickLotType(zoneId: ZoneId, index: number): BuildingLot['lotType'] {
  if (zoneId === 'townCore') {
    const types: BuildingLot['lotType'][] = ['shop', 'shop', 'house2', 'compound', 'utility'];
    return types[index % types.length];
  }
  if (zoneId === 'westVillage') {
    const types: BuildingLot['lotType'][] = ['house1', 'house2', 'compound', 'shed'];
    return types[index % types.length];
  }
  if (zoneId === 'damLake') return index % 3 === 0 ? 'utility' : 'shed';
  const types: BuildingLot['lotType'][] = ['house1', 'house2', 'shed', 'compound'];
  return types[index % types.length];
}

function generateBuildingLots(seeds: SettlementSeed[]): BuildingLot[] {
  const lots: BuildingLot[] = [];
  let enterableBudget = 12;

  seeds.forEach((seed, seedIndex) => {
    const arcStep = (Math.PI * 2) / seed.targetBuildings;
    const baseRotation = hashNoise(seed.center.x / 200, seed.center.z / 240, BUILDING_SEED + seedIndex) * Math.PI;

    for (let i = 0; i < seed.targetBuildings; i += 1) {
      const angle = baseRotation + arcStep * i + hashNoise(i * 0.7, seedIndex * 0.9, BUILDING_SEED) * 0.28;
      const distance = seed.clusterRadius * (0.28 + (i % 3) * 0.16 + Math.max(0, hashNoise(i, seedIndex, BUILDING_SEED + 17) * 0.08));
      const center = {
        x: seed.center.x + Math.cos(angle) * distance,
        z: seed.center.z + Math.sin(angle) * distance * (seed.laneStyle === 'market' ? 0.8 : 1),
      };
      const width = seed.zoneId === 'townCore' ? 9 + (i % 3) * 2 : 8 + (i % 2) * 2;
      const depth = seed.zoneId === 'townCore' ? 8 + ((i + 1) % 3) * 2 : 9 + ((i + 2) % 2) * 2.4;
      const enterable =
        enterableBudget > 0 &&
        ((seed.zoneId === 'townCore' && i % 5 === 0) ||
          (seed.zoneId === 'westVillage' && i % 6 === 0) ||
          (seed.zoneId === 'damLake' && i === 0));
      if (enterable) enterableBudget -= 1;

      lots.push({
        id: `${seed.id}-lot-${i}`,
        settlementId: seed.id,
        zoneId: seed.zoneId,
        center,
        width,
        depth,
        rotation: angle + (seed.zoneId === 'townCore' ? Math.PI / 2 : Math.PI / 3),
        lotType: pickLotType(seed.zoneId, i + seedIndex),
        enterable,
        roofAccess: enterable || (seed.zoneId === 'townCore' && i % 2 === 0),
      });
    }
  });

  return lots;
}

function stampSettlementPads(masks: MaskMap, lots: BuildingLot[], seeds: SettlementSeed[]) {
  const centers = [...seeds.map((seed) => seed.center), ...lots.map((lot) => lot.center)];
  eachCell((col, row, point) => {
    const idx = indexFor(col, row);
    let flatten = masks.settlementPads.values[idx];
    for (const center of centers) {
      const distance = worldDistance(point, center);
      if (distance < 110) flatten = Math.max(flatten, smoothstep(110, 0, distance));
    }
    masks.settlementPads.values[idx] = flatten;
  });
}

function generateCoverAnchors(roads: RoadSpline[], lots: BuildingLot[]): CoverAnchor[] {
  const anchors: CoverAnchor[] = lots.map((lot) => ({
    id: `${lot.id}-structure-cover`,
    center: lot.center,
    kind: 'structure',
  }));

  roads
    .filter((road) => road.kind !== 'lane')
    .forEach((road, roadIndex) => {
      road.controlPoints.forEach((point, pointIndex) => {
        if (pointIndex === road.controlPoints.length - 1) return;
        const next = road.controlPoints[pointIndex + 1];
        const segmentLength = worldDistance(point, next);
        const steps = Math.max(1, Math.floor(segmentLength / 95));
        for (let step = 0; step <= steps; step += 1) {
          const t = step / Math.max(steps, 1);
          anchors.push({
            id: `${road.id}-cover-${roadIndex}-${pointIndex}-${step}`,
            center: {
              x: lerp(point.x, next.x, t) + hashNoise(step, roadIndex, 41) * 12,
              z: lerp(point.z, next.z, t) + hashNoise(roadIndex, step, 43) * 12,
            },
            kind: step % 3 === 0 ? 'wall' : step % 2 === 0 ? 'tree' : 'rock',
          });
        }
      });
    });

  return anchors;
}

function generatePropSeeds(seeds: SettlementSeed[], coverAnchors: CoverAnchor[], roads: RoadSpline[]): PropSeed[] {
  const props: PropSeed[] = [];
  let counter = 0;

  const pushProp = (kind: PropSeed['kind'], center: Vec2, zoneId: ZoneId, cover: boolean, scale = 1, rotation = 0) => {
    props.push({ id: `prop-${counter}`, kind, center, rotation, scale, zoneId, cover });
    counter += 1;
  };

  seeds.forEach((seed, seedIndex) => {
    const density = seed.zoneId === 'townCore' ? 12 : seed.zoneId === 'westVillage' ? 8 : seed.zoneId === 'damLake' ? 5 : 6;
    for (let i = 0; i < density; i += 1) {
      const angle = ((i + 1) / density) * Math.PI * 2 + hashNoise(seedIndex, i, PROP_SEED) * 0.3;
      const distance = seed.clusterRadius * (0.4 + (i % 4) * 0.12);
      const center = {
        x: seed.center.x + Math.cos(angle) * distance,
        z: seed.center.z + Math.sin(angle) * distance,
      };
      if (seed.zoneId === 'townCore') {
        pushProp(i % 3 === 0 ? 'pole' : i % 2 === 0 ? 'crate' : 'bench', center, seed.zoneId, i % 2 === 0);
        if (i % 4 === 0) pushProp('wall', { x: center.x + 6, z: center.z - 4 }, seed.zoneId, true, 1.1, angle);
      } else if (seed.zoneId === 'westVillage') {
        pushProp(i % 3 === 0 ? 'tree' : i % 2 === 0 ? 'wall' : 'pump', center, seed.zoneId, true);
      } else if (seed.zoneId === 'damLake') {
        pushProp(i % 2 === 0 ? 'rock' : 'fence', center, seed.zoneId, true, 1.1);
      } else {
        pushProp(i % 2 === 0 ? 'tree' : 'shed', center, seed.zoneId, i % 2 === 0);
      }
    }
  });

  coverAnchors.forEach((anchor, index) => {
    const jitter = hashNoise(index * 0.3, index * 0.8, PROP_SEED + 19);
    const zoneId: ZoneId =
      anchor.center.z > 1250
        ? 'damLake'
        : anchor.center.z > 1100
          ? 'southRidge'
          : anchor.center.x > 1100
            ? 'eastRidge'
            : anchor.center.x > 250 && anchor.center.z < 220
              ? 'townCore'
              : anchor.center.x < -900
                ? 'westVillage'
                : 'centralFields';
    const kind = anchor.kind === 'wall' ? 'wall' : anchor.kind === 'tree' ? 'tree' : anchor.kind === 'rock' ? 'rock' : 'bush';
    pushProp(kind, { x: anchor.center.x + jitter * 8, z: anchor.center.z - jitter * 6 }, zoneId, true, zoneId === 'townCore' ? 0.9 : 1.1, jitter);
  });

  roads.forEach((road) => {
    road.controlPoints.forEach((point, pointIndex) => {
      if (road.kind === 'arterial' || road.kind === 'secondary') {
        const offset = pointIndex % 2 === 0 ? 11 : -11;
        pushProp('pole', { x: point.x + offset, z: point.z + offset * 0.35 }, road.connects[0] ?? 'centralFields', false);
      }
      if (road.kind === 'track' && pointIndex % 2 === 0) {
        pushProp('tree', { x: point.x + 16, z: point.z - 14 }, 'centralFields', true, 1.2);
      }
    });
  });

  return props;
}

function generateLandmarks(): LandmarkDef[] {
  return [
    { id: 'lm-0', label: 'Kawakol Market', center: { x: 760, z: -300 }, zoneId: 'townCore', landmarkType: 'market', combatRole: 'close' },
    { id: 'lm-1', label: 'Paras Mod', center: { x: 890, z: -140 }, zoneId: 'townCore', landmarkType: 'market', combatRole: 'close' },
    { id: 'lm-2', label: 'Sokhodeora School', center: { x: 650, z: -20 }, zoneId: 'townCore', landmarkType: 'junction', combatRole: 'mixed' },
    { id: 'lm-3', label: 'Kawakol Block Road', center: { x: 820, z: 450 }, zoneId: 'centralFields', landmarkType: 'junction', combatRole: 'mid' },
    { id: 'lm-4', label: 'Sokhodeora', center: { x: -1190, z: 1000 }, zoneId: 'westVillage', landmarkType: 'compound', combatRole: 'close' },
    { id: 'lm-5', label: 'JP Ashram', center: { x: -260, z: 620 }, zoneId: 'centralFields', landmarkType: 'field', combatRole: 'mid' },
    { id: 'lm-6', label: 'Niraj Mod', center: { x: -1360, z: 1110 }, zoneId: 'westVillage', landmarkType: 'compound', combatRole: 'mixed' },
    { id: 'lm-7', label: 'Sokhodeora Dam', center: { x: -1120, z: 1370 }, zoneId: 'damLake', landmarkType: 'dam', combatRole: 'long' },
    { id: 'lm-8', label: 'Shiv Mandir', center: { x: -980, z: 1320 }, zoneId: 'damLake', landmarkType: 'dam', combatRole: 'long' },
    { id: 'lm-9', label: 'Echo Point', center: { x: 1480, z: 320 }, zoneId: 'eastRidge', landmarkType: 'ridge', combatRole: 'long' },
  ];
}

function generateSectorCells(): SectorCell[] {
  const cells: SectorCell[] = [];
  const cols = Math.floor((WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / SECTOR_SIZE);
  const rows = Math.floor((WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / SECTOR_SIZE);
  const southRidge = zoneById('southRidge');
  const damLake = zoneById('damLake');
  const townCore = zoneById('townCore');
  const westVillage = zoneById('westVillage');
  const eastRidge = zoneById('eastRidge');

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const center = {
        x: WORLD_BOUNDS.minX + col * SECTOR_SIZE + SECTOR_SIZE / 2,
        z: WORLD_BOUNDS.minZ + row * SECTOR_SIZE + SECTOR_SIZE / 2,
      };
      let purpose: SectorCell['purpose'] = 'agriOpen';
      if (zoneInfluence(center, townCore) > 0.2 || zoneInfluence(center, westVillage) > 0.2) purpose = 'builtup';
      else if (zoneInfluence(center, damLake) > 0.4) purpose = 'lakeWater';
      else if (zoneInfluence(center, southRidge) > 0.35 || zoneInfluence(center, eastRidge) > 0.35) purpose = 'ridgeWild';
      else if (Math.abs(center.x - 760) < 180 && Math.abs(center.z + 300) < 180) purpose = 'roadJunction';
      cells.push({ col, row, center, purpose });
    }
  }

  return cells;
}

function lotToPolygon(lot: BuildingLot): Vec2[] {
  const halfW = lot.width / 2;
  const halfD = lot.depth / 2;
  return [
    rotatePoint({ x: lot.center.x - halfW, z: lot.center.z - halfD }, lot.rotation, lot.center),
    rotatePoint({ x: lot.center.x + halfW, z: lot.center.z - halfD }, lot.rotation, lot.center),
    rotatePoint({ x: lot.center.x + halfW, z: lot.center.z + halfD }, lot.rotation, lot.center),
    rotatePoint({ x: lot.center.x - halfW, z: lot.center.z + halfD }, lot.rotation, lot.center),
  ];
}

function zoneFeature(zone: MacroZone): MapFeatureLayer {
  if (zone.shape === 'polygon' && zone.polygon) {
    return {
      id: `zone-${zone.id}`,
      kind: zone.id === 'damLake' ? 'water' : zone.id.includes('Ridge') ? 'ridge' : 'zone',
      geometry: { type: 'polygon', points: zone.polygon },
      label: zone.id,
    };
  }

  if (zone.shape === 'splineBand' && zone.spline && zone.bandWidth) {
    const top = zone.spline.map((point) => ({ x: point.x, z: point.z - zone.bandWidth / 2 }));
    const bottom = [...zone.spline].reverse().map((point) => ({ x: point.x, z: point.z + zone.bandWidth / 2 }));
    return {
      id: `zone-${zone.id}`,
      kind: 'ridge',
      geometry: { type: 'polygon', points: [...top, ...bottom] },
      label: zone.id,
    };
  }

  const points: Vec2[] = [];
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    points.push({
      x: zone.center.x + Math.cos(angle) * zone.extent.x,
      z: zone.center.z + Math.sin(angle) * zone.extent.z,
    });
  }
  return {
    id: `zone-${zone.id}`,
    kind: zone.id === 'centralFields' ? 'fields' : zone.id.includes('Ridge') ? 'ridge' : 'zone',
    geometry: { type: 'polygon', points },
    label: zone.id,
  };
}

function generateMapFeatures(roads: RoadSpline[], lots: BuildingLot[], landmarks: LandmarkDef[], sectorCells: SectorCell[]): MapFeatureLayer[] {
  const features: MapFeatureLayer[] = [];

  MACRO_ZONES.forEach((zone) => features.push(zoneFeature(zone)));
  roads.forEach((road) => {
    features.push({
      id: `road-${road.id}`,
      kind: 'roads',
      geometry: { type: 'polyline', points: road.controlPoints },
      style: { width: road.width, surface: road.surface },
    });
  });
  lots.forEach((lot) => {
    features.push({
      id: `builtup-${lot.id}`,
      kind: 'builtup',
      geometry: { type: 'polygon', points: lotToPolygon(lot) },
      style: { lotType: lot.lotType },
    });
  });
  sectorCells
    .filter((cell) => cell.purpose === 'agriOpen')
    .forEach((cell) => {
      features.push({
        id: `field-${cell.col}-${cell.row}`,
        kind: 'fields',
        geometry: { type: 'rect', center: cell.center, width: SECTOR_SIZE, height: SECTOR_SIZE, rotation: 0 },
      });
    });
  landmarks.forEach((landmark) => {
    features.push({
      id: `landmark-${landmark.id}`,
      kind: 'landmarks',
      geometry: { type: 'point', point: landmark.center },
      label: landmark.label,
    });
  });

  return features;
}

export function buildWorldLayout(): WorldLayout {
  const masks = createTerrainMasks();
  const roadSplines: RoadSpline[] = [];
  const settlementSeeds: SettlementSeed[] = [];
  const buildingLots: BuildingLot[] = [];
  let propSeeds: PropSeed[] = [];
  let coverAnchors: CoverAnchor[] = [];
  let landmarks: LandmarkDef[] = [];
  let sectorCells: SectorCell[] = [];
  let mapFeatures: MapFeatureLayer[] = [];

  for (const step of WORLD_LAYOUT_ORDER) {
    switch (step) {
      case 'defineWorldBounds':
      case 'generateMacroZones':
        break;
      case 'generateTerrainMasks':
        generateBaseTerrainMasks(masks);
        break;
      case 'generateMainRoads':
        createRoadSplines()
          .filter((road) => road.id === 'R0')
          .forEach((road) => roadSplines.push(road));
        break;
      case 'generateSecondaryRoads':
        createRoadSplines()
          .filter((road) => road.id !== 'R0')
          .forEach((road) => roadSplines.push(road));
        stampRoadFlatten(masks, roadSplines);
        break;
      case 'generateVillageClusters':
        generateSettlementSeeds().forEach((seed) => settlementSeeds.push(seed));
        createLaneSplinesForSettlements(settlementSeeds).forEach((road) => roadSplines.push(road));
        stampRoadFlatten(masks, roadSplines);
        break;
      case 'generateBuildingsInsideClusters':
        generateBuildingLots(settlementSeeds).forEach((lot) => buildingLots.push(lot));
        stampSettlementPads(masks, buildingLots, settlementSeeds);
        break;
      case 'generatePropsAndVegetation':
        coverAnchors = generateCoverAnchors(roadSplines, buildingLots);
        propSeeds = generatePropSeeds(settlementSeeds, coverAnchors, roadSplines);
        break;
      case 'generateLandmarks':
        landmarks = generateLandmarks();
        sectorCells = generateSectorCells();
        break;
      case 'generateMapData':
        mapFeatures = generateMapFeatures(roadSplines, buildingLots, landmarks, sectorCells);
        break;
      default:
        break;
    }
  }

  return {
    bounds: WORLD_BOUNDS,
    northUp: true,
    zoneSeeds: MACRO_ZONES,
    terrainMasks: LAYER_ORDER.map((name) => masks[name]),
    roadSplines,
    settlementSeeds,
    buildingLots,
    propSeeds,
    coverAnchors,
    sectorCells,
    landmarks,
    mapFeatures,
  };
}
