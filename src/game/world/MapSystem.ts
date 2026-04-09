import { clampToMap, mapToWorld, worldToMap, zoneToMapRadius } from '../utils/coord';
import type { NormalizedPoint } from '../utils/coord';
import type { MapFeatureLayer, Vec2, WorldLayout } from './types';

export interface MapRenderableFeature {
  id: string;
  kind: MapFeatureLayer['kind'];
  points?: NormalizedPoint[];
  point?: NormalizedPoint;
  rect?: { center: NormalizedPoint; width: number; height: number; rotation: number };
  label?: string;
  style?: Record<string, string | number>;
}

export class MapSystem {
  constructor(private readonly layout: WorldLayout) {}

  public getLayout() {
    return this.layout;
  }

  public worldToMap(point: Vec2) {
    return clampToMap(worldToMap(point, this.layout.bounds));
  }

  public mapToWorld(point: NormalizedPoint) {
    return mapToWorld(point, this.layout.bounds);
  }

  public zoneRadiusToMap(radius: number) {
    return zoneToMapRadius(radius, this.layout.bounds);
  }

  public getRenderableFeatures(): MapRenderableFeature[] {
    return this.layout.mapFeatures.map((feature) => {
      if (feature.geometry.type === 'polyline' || feature.geometry.type === 'polygon') {
        return {
          id: feature.id,
          kind: feature.kind,
          points: feature.geometry.points.map((point) => this.worldToMap(point)),
          label: feature.label,
          style: feature.style,
        };
      }

      if (feature.geometry.type === 'point') {
        return {
          id: feature.id,
          kind: feature.kind,
          point: this.worldToMap(feature.geometry.point),
          label: feature.label,
          style: feature.style,
        };
      }

      return {
        id: feature.id,
        kind: feature.kind,
        rect: {
          center: this.worldToMap(feature.geometry.center),
          width: feature.geometry.width / (this.layout.bounds.maxX - this.layout.bounds.minX),
          height: feature.geometry.height / (this.layout.bounds.maxZ - this.layout.bounds.minZ),
          rotation: feature.geometry.rotation,
        },
        label: feature.label,
        style: feature.style,
      };
    });
  }
}
