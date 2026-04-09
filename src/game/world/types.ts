export type Vec2 = { x: number; z: number };

export type ZoneId =
  | 'townCore'
  | 'westVillage'
  | 'damLake'
  | 'southRidge'
  | 'eastRidge'
  | 'centralFields'
  | 'outerHamlets';

export type TerrainLayerName =
  | 'farmlandRoll'
  | 'southRidgeMass'
  | 'eastRidgeMass'
  | 'damBasin'
  | 'settlementPads'
  | 'roadFlatten'
  | 'bundLines'
  | 'drainageCuts'
  | 'combatCover';

export type LootTier = 'high' | 'medium' | 'low' | 'none';
export type MacroZoneShape = 'ellipse' | 'polygon' | 'splineBand';
export type TerrainBlend = 'add' | 'subtract' | 'max' | 'override';
export type RoadKind = 'arterial' | 'secondary' | 'lane' | 'track';
export type RoadSurface = 'asphalt' | 'worn' | 'dirt';
export type LaneStyle = 'market' | 'village' | 'hamlet';
export type LotType = 'shop' | 'house1' | 'house2' | 'shed' | 'compound' | 'utility';
export type LandmarkType = 'junction' | 'market' | 'ridge' | 'dam' | 'compound' | 'field';
export type CombatRole = 'close' | 'mid' | 'long' | 'mixed';
export type SectorPurpose =
  | 'builtup'
  | 'agriOpen'
  | 'ridgeWild'
  | 'lakeWater'
  | 'roadJunction'
  | 'landmark';

export interface MacroZone {
  id: ZoneId;
  center: Vec2;
  extent: { x: number; z: number };
  shape: MacroZoneShape;
  elevationBias: number;
  density: number;
  lootTier: LootTier;
  polygon?: Vec2[];
  spline?: Vec2[];
  bandWidth?: number;
}

export interface TerrainMask {
  name: TerrainLayerName;
  width: 512;
  height: 512;
  blend: TerrainBlend;
  weight: number;
  values: Float32Array;
}

export interface RoadSpline {
  id: string;
  kind: RoadKind;
  surface: RoadSurface;
  width: number;
  shoulder: number;
  flattenRadius: number;
  controlPoints: Vec2[];
  connects: ZoneId[];
}

export interface SettlementSeed {
  id: string;
  zoneId: ZoneId;
  center: Vec2;
  clusterRadius: number;
  clusterCount: number;
  laneStyle: LaneStyle;
  targetBuildings: number;
}

export interface BuildingLot {
  id: string;
  settlementId: string;
  zoneId: ZoneId;
  center: Vec2;
  width: number;
  depth: number;
  rotation: number;
  lotType: LotType;
  enterable: boolean;
  roofAccess: boolean;
}

export interface LandmarkDef {
  id: string;
  label: string;
  center: Vec2;
  zoneId: ZoneId;
  landmarkType: LandmarkType;
  combatRole: CombatRole;
}

export interface MapPolylineGeometry {
  type: 'polyline';
  points: Vec2[];
}

export interface MapPolygonGeometry {
  type: 'polygon';
  points: Vec2[];
}

export interface MapPointGeometry {
  type: 'point';
  point: Vec2;
}

export interface MapRectGeometry {
  type: 'rect';
  center: Vec2;
  width: number;
  height: number;
  rotation: number;
}

export type MapGeometry =
  | MapPolylineGeometry
  | MapPolygonGeometry
  | MapPointGeometry
  | MapRectGeometry;

export interface MapFeatureLayer {
  id: string;
  kind: 'roads' | 'builtup' | 'water' | 'ridge' | 'fields' | 'landmarks' | 'zone';
  geometry: MapGeometry;
  style?: Record<string, string | number>;
  label?: string;
}

export interface PropSeed {
  id: string;
  kind:
    | 'tree'
    | 'bush'
    | 'rock'
    | 'pole'
    | 'wall'
    | 'crate'
    | 'bench'
    | 'pump'
    | 'sign'
    | 'culvert'
    | 'fence'
    | 'shed'
    | 'debris';
  center: Vec2;
  rotation: number;
  scale: number;
  zoneId: ZoneId;
  cover: boolean;
}

export interface CoverAnchor {
  id: string;
  center: Vec2;
  kind: 'terrain' | 'prop' | 'wall' | 'tree' | 'rock' | 'structure';
}

export interface SectorCell {
  col: number;
  row: number;
  center: Vec2;
  purpose: SectorPurpose;
}

export interface ValidationReport {
  valid: boolean;
  errors: string[];
}

export interface WorldLayout {
  bounds: { minX: -2000; maxX: 2000; minZ: -2000; maxZ: 2000 };
  northUp: true;
  zoneSeeds: MacroZone[];
  terrainMasks: TerrainMask[];
  roadSplines: RoadSpline[];
  settlementSeeds: SettlementSeed[];
  buildingLots: BuildingLot[];
  propSeeds: PropSeed[];
  coverAnchors: CoverAnchor[];
  sectorCells: SectorCell[];
  landmarks: LandmarkDef[];
  mapFeatures: MapFeatureLayer[];
}
