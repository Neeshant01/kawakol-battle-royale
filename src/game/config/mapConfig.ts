import type { MacroZone, Vec2 } from '../world/types';

export const WORLD_BOUNDS = {
  minX: -2000 as const,
  maxX: 2000 as const,
  minZ: -2000 as const,
  maxZ: 2000 as const,
};

export const MAP_MASK_RESOLUTION = 512 as const;
export const SECTOR_SIZE = 250;
export const STREAMING_SECTOR_SIZE = 500;
export const VALIDATION_ROUND_TRIP_TOLERANCE = 5;

export const TERRAIN_COLORS = {
  cultivatedGreen: '#5E6B3D',
  darkCropGreen: '#44552C',
  dryBrown: '#8A7552',
  lightDrySoil: '#B29363',
  muddyBank: '#74664D',
  rockyGrey: '#6C6761',
  deepWater: '#1F343C',
  shallowWater: '#375A5C',
  fog: '#B8C4C8',
};

export const BUILDING_COLORS = {
  cementWhite: '#D5D0C6',
  dustyBeige: '#BDAF9B',
  fadedLimeWash: '#BFC7AE',
  dustyPink: '#C8A596',
  brickAccent: '#8D5A4A',
  shutterMetal: '#6C6E72',
  roofTin: '#6F746B',
};

export const LIGHTING_CONFIG = {
  ambient: '#C7D5DA',
  sun: '#FFF1D6',
  bounce: '#D9C3A0',
  fogStart: 1600,
  fogEnd: 4200,
  fogColor: '#B8C4C8',
};

export const WORLD_LAYOUT_ORDER = [
  'defineWorldBounds',
  'generateMacroZones',
  'generateTerrainMasks',
  'generateMainRoads',
  'generateSecondaryRoads',
  'generateVillageClusters',
  'generateBuildingsInsideClusters',
  'generatePropsAndVegetation',
  'generateLandmarks',
  'generateMapData',
] as const;

export const FIELD_TRACKS: Vec2[][] = [
  [
    { x: -1640, z: 820 },
    { x: -1340, z: 760 },
    { x: -1030, z: 700 },
    { x: -760, z: 610 },
  ],
  [
    { x: -360, z: 180 },
    { x: -160, z: 340 },
    { x: 80, z: 470 },
    { x: 320, z: 530 },
  ],
  [
    { x: 1240, z: 1050 },
    { x: 990, z: 900 },
    { x: 860, z: 720 },
    { x: 750, z: 520 },
  ],
  [
    { x: 1600, z: -120 },
    { x: 1420, z: -10 },
    { x: 1250, z: 170 },
    { x: 1180, z: 410 },
  ],
  [
    { x: -980, z: 860 },
    { x: -820, z: 1110 },
    { x: -970, z: 1300 },
    { x: -1160, z: 1410 },
  ],
  [
    { x: -220, z: 560 },
    { x: -10, z: 740 },
    { x: 210, z: 900 },
    { x: 520, z: 1040 },
  ],
];

export const MACRO_ZONES: MacroZone[] = [
  {
    id: 'townCore',
    center: { x: 720, z: -260 },
    extent: { x: 520, z: 430 },
    shape: 'ellipse',
    elevationBias: 3,
    density: 0.95,
    lootTier: 'high',
  },
  {
    id: 'westVillage',
    center: { x: -1180, z: 980 },
    extent: { x: 460, z: 360 },
    shape: 'ellipse',
    elevationBias: 2,
    density: 0.72,
    lootTier: 'medium',
  },
  {
    id: 'damLake',
    center: { x: -1180, z: 1500 },
    extent: { x: 420, z: 290 },
    shape: 'polygon',
    elevationBias: -10,
    density: 0.18,
    lootTier: 'low',
    polygon: [
      { x: -1460, z: 1420 },
      { x: -1350, z: 1290 },
      { x: -1140, z: 1260 },
      { x: -920, z: 1340 },
      { x: -860, z: 1490 },
      { x: -920, z: 1670 },
      { x: -1090, z: 1760 },
      { x: -1300, z: 1710 },
      { x: -1470, z: 1570 },
    ],
  },
  {
    id: 'southRidge',
    center: { x: -360, z: 1400 },
    extent: { x: 1400, z: 420 },
    shape: 'splineBand',
    elevationBias: 22,
    density: 0.28,
    lootTier: 'low',
    spline: [
      { x: -1900, z: 1320 },
      { x: -900, z: 1470 },
      { x: 250, z: 1500 },
      { x: 1050, z: 1280 },
    ],
    bandWidth: 420,
  },
  {
    id: 'eastRidge',
    center: { x: 1450, z: 320 },
    extent: { x: 320, z: 460 },
    shape: 'ellipse',
    elevationBias: 16,
    density: 0.22,
    lootTier: 'low',
  },
  {
    id: 'centralFields',
    center: { x: -220, z: 420 },
    extent: { x: 1220, z: 950 },
    shape: 'ellipse',
    elevationBias: 0,
    density: 0.12,
    lootTier: 'low',
  },
  {
    id: 'outerHamlets',
    center: { x: 0, z: 0 },
    extent: { x: 1800, z: 1800 },
    shape: 'polygon',
    elevationBias: 0,
    density: 0.16,
    lootTier: 'low',
    polygon: [
      { x: -1800, z: 680 },
      { x: -540, z: 60 },
      { x: 1740, z: -240 },
      { x: 1340, z: 1240 },
      { x: -1700, z: 1080 },
    ],
  },
];
