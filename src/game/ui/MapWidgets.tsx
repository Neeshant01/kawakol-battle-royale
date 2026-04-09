import React from 'react';
import * as THREE from 'three';
import { clampToMap } from '../utils/coord';
import { MapSystem } from '../world/MapSystem';
import type { MapFeatureLayer, Vec2 } from '../world/types';

type Pin = { x: number; z: number; id: string };

const FULL_SIZE = 1000;
const DEFAULT_MINIMAP_RADIUS = 220;

function kindStyle(kind: MapFeatureLayer['kind']) {
  switch (kind) {
    case 'water':
      return { fill: '#214A56', stroke: '#76A7A6', strokeWidth: 1.4, opacity: 0.96 };
    case 'ridge':
      return { fill: '#4F5C46', stroke: '#7E8664', strokeWidth: 1.1, opacity: 0.42 };
    case 'fields':
      return { fill: '#5B743B', stroke: '#8CA267', strokeWidth: 0.28, opacity: 0.2 };
    case 'builtup':
      return { fill: '#CFC5B2', stroke: '#978A73', strokeWidth: 0.42, opacity: 0.9 };
    case 'roads':
      return { fill: 'none', stroke: '#BBA171', strokeWidth: 3.2, opacity: 0.92 };
    case 'landmarks':
      return { fill: '#F1D58B', stroke: '#0F1216', strokeWidth: 1, opacity: 1 };
    default:
      return { fill: 'none', stroke: '#8D9786', strokeWidth: 1, opacity: 0.15 };
  }
}

function pointsToString(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function toFullMapPoint(point: { u: number; v: number }) {
  return { x: point.u * FULL_SIZE, y: point.v * FULL_SIZE };
}

function renderFullFeature(feature: ReturnType<MapSystem['getRenderableFeatures']>[number]) {
  const style = kindStyle(feature.kind);

  if (feature.points) {
    const mapped = feature.points.map(toFullMapPoint);
    if (feature.kind === 'roads') {
      return (
        <polyline
          key={feature.id}
          points={pointsToString(mapped)}
          fill="none"
          stroke={String(style.stroke)}
          strokeWidth={Number(style.strokeWidth)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={Number(style.opacity)}
        />
      );
    }
    return (
      <polygon
        key={feature.id}
        points={pointsToString(mapped)}
        fill={String(style.fill)}
        stroke={String(style.stroke)}
        strokeWidth={Number(style.strokeWidth)}
        opacity={Number(style.opacity)}
      />
    );
  }

  if (feature.rect) {
    const width = feature.rect.width * FULL_SIZE;
    const height = feature.rect.height * FULL_SIZE;
    const center = toFullMapPoint(feature.rect.center);
    return (
      <rect
        key={feature.id}
        x={center.x - width / 2}
        y={center.y - height / 2}
        width={width}
        height={height}
        fill={String(style.fill)}
        stroke={String(style.stroke)}
        strokeWidth={Number(style.strokeWidth)}
        opacity={Number(style.opacity)}
      />
    );
  }

  if (!feature.point) return null;
  const point = toFullMapPoint(feature.point);
  return (
    <g key={feature.id}>
      <title>{feature.label ?? feature.id}</title>
      <circle cx={point.x} cy={point.y} r={5} fill={String(style.fill)} stroke={String(style.stroke)} strokeWidth={1} />
      {feature.label ? (
        <text
          x={point.x + 14}
          y={point.y - 12}
          fill="#F6E8B8"
          fontSize="26"
          fontWeight="800"
          fontFamily="Rajdhani, sans-serif"
          stroke="#091013"
          strokeWidth="5"
          paintOrder="stroke"
          letterSpacing="0.5"
        >
          {feature.label}
        </text>
      ) : null}
    </g>
  );
}

function worldToMiniPoint(point: Vec2, playerPos: THREE.Vector3, playerRot: number, range: number, radius: number) {
  const dx = point.x - playerPos.x;
  const dz = point.z - playerPos.z;
  const c = Math.cos(playerRot);
  const s = Math.sin(playerRot);
  const rx = dx * c - dz * s;
  const rz = dx * s + dz * c;
  return {
    x: (rx / range) * radius,
    y: (rz / range) * radius,
  };
}

function renderMiniFeature(feature: MapFeatureLayer, playerPos: THREE.Vector3, playerRot: number, range: number, radius: number) {
  const style = kindStyle(feature.kind);

  if (feature.geometry.type === 'polyline' || feature.geometry.type === 'polygon') {
    const mapped = feature.geometry.points
      .map((point) => worldToMiniPoint(point, playerPos, playerRot, range, radius))
      .filter((point) => Math.abs(point.x) <= radius * 1.8 && Math.abs(point.y) <= radius * 1.8);
    if (mapped.length < 2) return null;
    if (feature.kind === 'roads') {
      return (
        <polyline
          key={feature.id}
          points={pointsToString(mapped)}
          fill="none"
          stroke={String(style.stroke)}
          strokeWidth={feature.kind === 'roads' ? 4 : Number(style.strokeWidth)}
          opacity={Number(style.opacity)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    return (
      <polygon
        key={feature.id}
        points={pointsToString(mapped)}
        fill={String(style.fill)}
        stroke={String(style.stroke)}
        strokeWidth={Number(style.strokeWidth)}
        opacity={Number(style.opacity)}
      />
    );
  }

  if (feature.geometry.type === 'rect') {
    const center = worldToMiniPoint(feature.geometry.center, playerPos, playerRot, range, radius);
    const width = (feature.geometry.width / range) * radius;
    const height = (feature.geometry.height / range) * radius;
    return (
      <rect
        key={feature.id}
        x={center.x - width / 2}
        y={center.y - height / 2}
        width={width}
        height={height}
        fill={String(style.fill)}
        opacity={Number(style.opacity)}
      />
    );
  }

  if (feature.geometry.type === 'point') {
    const point = worldToMiniPoint(feature.geometry.point, playerPos, playerRot, range, radius);
    if (Math.abs(point.x) > radius * 1.4 || Math.abs(point.y) > radius * 1.4) return null;
    return <circle key={feature.id} cx={point.x} cy={point.y} r={3.2} fill={String(style.fill)} opacity="0.95" />;
  }

  return null;
}

export function MiniMap({
  mapSystem,
  playerPos,
  playerRot,
  zone,
  pins,
  threats = [],
  size = 220,
}: {
  mapSystem: MapSystem;
  playerPos: THREE.Vector3;
  playerRot: number;
  zone: { x: number; z: number; radius: number };
  pins: Pin[];
  threats?: Array<{ x: number; z: number }>;
  size?: number;
}) {
  const layout = mapSystem.getLayout();
  const range = 460;
  const radius = (size / 220) * DEFAULT_MINIMAP_RADIUS;
  const zoneCenter = worldToMiniPoint({ x: zone.x, z: zone.z }, playerPos, playerRot, range, radius);
  const zoneRadius = (zone.radius / range) * radius;

  return (
    <div
      className="rounded-[1.5rem] overflow-hidden border border-white/12 bg-[#0E1214]/90 shadow-[0_16px_36px_rgba(0,0,0,0.45)] backdrop-blur-md"
      style={{ width: size, height: size }}
      aria-label="Mini map"
    >
      <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`} className="w-full h-full">
        <defs>
          <clipPath id="miniClip">
            <circle cx="0" cy="0" r={radius - 8} />
          </clipPath>
          <radialGradient id="miniField" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#6B8642" />
            <stop offset="65%" stopColor="#4F6634" />
            <stop offset="100%" stopColor="#31442C" />
          </radialGradient>
        </defs>
        <rect x={-radius} y={-radius} width={radius * 2} height={radius * 2} fill="url(#miniField)" />
        <g clipPath="url(#miniClip)">
          {layout.mapFeatures.map((feature) => renderMiniFeature(feature, playerPos, playerRot, range, radius))}
          <circle cx={zoneCenter.x} cy={zoneCenter.y} r={zoneRadius} fill="none" stroke="#68A3FF" strokeWidth="4" opacity="0.75" />
          {pins.map((pin) => {
            const point = worldToMiniPoint(pin, playerPos, playerRot, range, radius);
            return <circle key={pin.id} cx={point.x} cy={point.y} r="5" fill="#FF694A" stroke="#fff" strokeWidth="1.4" />;
          })}
          {threats.map((threat, index) => {
            const point = worldToMiniPoint(threat, playerPos, playerRot, range, radius);
            return (
              <g key={`threat-${index}`}>
                <circle cx={point.x} cy={point.y} r="8" fill="rgba(220,92,82,0.18)" />
                <circle cx={point.x} cy={point.y} r="3.5" fill="#E06C5C" stroke="#fff" strokeWidth="1" />
              </g>
            );
          })}
        </g>
        <circle cx="0" cy="0" r={radius - 8} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
        <polygon points="0,-16 11,14 0,8 -11,14" fill="#79A7FF" stroke="#fff" strokeWidth="2" />
      </svg>
    </div>
  );
}

export function FullMap({
  mapSystem,
  playerPos,
  zone,
  pins,
  onAddPin,
  onRemovePin,
}: {
  mapSystem: MapSystem;
  playerPos: THREE.Vector3;
  zone: { x: number; z: number; radius: number };
  pins: Pin[];
  onAddPin: (x: number, z: number) => void;
  onRemovePin: (id: string) => void;
}) {
  const renderables = mapSystem.getRenderableFeatures();
  const player = toFullMapPoint(mapSystem.worldToMap({ x: playerPos.x, z: playerPos.z }));
  const zoneCenter = toFullMapPoint(mapSystem.worldToMap({ x: zone.x, z: zone.z }));
  const zoneRadius = mapSystem.zoneRadiusToMap(zone.radius) * FULL_SIZE;

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const normalized = clampToMap({
      u: (event.clientX - rect.left) / rect.width,
      v: (event.clientY - rect.top) / rect.height,
    });
    const world = mapSystem.mapToWorld(normalized);
    onAddPin(world.x, world.z);
  };

  return (
    <div className="w-full h-full rounded-[2rem] overflow-hidden border border-white/10 bg-[#0D1113] relative" aria-label="Full tactical map">
      <svg viewBox={`0 0 ${FULL_SIZE} ${FULL_SIZE}`} className="w-full h-full" onClick={handleClick} role="img" aria-label="Full tactical map with roads, landmarks, and safe zone">
        <defs>
          <linearGradient id="fullMapBase" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#546B38" />
            <stop offset="45%" stopColor="#668146" />
            <stop offset="100%" stopColor="#31442C" />
          </linearGradient>
          <pattern id="fieldPattern" width="90" height="90" patternUnits="userSpaceOnUse">
            <rect width="90" height="90" fill="rgba(73,92,42,0.16)" />
            <rect width="44" height="44" fill="rgba(126,145,74,0.15)" />
            <rect x="48" y="48" width="34" height="34" fill="rgba(150,131,83,0.15)" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={FULL_SIZE} height={FULL_SIZE} fill="url(#fullMapBase)" />
        <rect x="0" y="0" width={FULL_SIZE} height={FULL_SIZE} fill="url(#fieldPattern)" opacity="0.75" />
        {renderables.map((feature) => renderFullFeature(feature))}
        <circle cx={zoneCenter.x} cy={zoneCenter.y} r={zoneRadius} fill="none" stroke="#68A3FF" strokeWidth="7" opacity="0.85" />
        {pins.map((pin) => {
          const point = toFullMapPoint(mapSystem.worldToMap(pin));
          return (
            <g key={pin.id} onClick={(event) => { event.stopPropagation(); onRemovePin(pin.id); }}>
              <circle cx={point.x} cy={point.y} r="10" fill="#FF694A" stroke="#fff" strokeWidth="2" />
            </g>
          );
        })}
        <circle cx={player.x} cy={player.y} r="11" fill="#79A7FF" stroke="#fff" strokeWidth="3" />
      </svg>
    </div>
  );
}
