import type { WorldLayout } from './world/types';

export type OfflineLoot = {
  id: string;
  type: 'AR' | 'Sniper' | 'SMG' | 'Shotgun' | 'Medkit' | 'Ammo';
  x: number;
  z: number;
};

export type ZoneState = { x: number; z: number; radius: number };

const LOOT_TYPES: OfflineLoot['type'][] = ['AR', 'Sniper', 'SMG', 'Shotgun', 'Medkit', 'Ammo'];

function pickWeightedLot(layout: WorldLayout, index: number) {
  const weighted = [
    ...layout.buildingLots.filter((lot) => lot.zoneId === 'townCore'),
    ...layout.buildingLots.filter((lot) => lot.zoneId === 'townCore'),
    ...layout.buildingLots.filter((lot) => lot.zoneId === 'westVillage'),
    ...layout.buildingLots.filter((lot) => lot.zoneId === 'westVillage'),
    ...layout.buildingLots.filter((lot) => lot.zoneId === 'outerHamlets'),
    ...layout.buildingLots.filter((lot) => lot.zoneId === 'damLake'),
  ];
  return weighted[index % weighted.length];
}

export function createOfflineLoot(layout: WorldLayout): OfflineLoot[] {
  const loot: OfflineLoot[] = [];
  for (let i = 0; i < 96; i += 1) {
    const lot = pickWeightedLot(layout, i * 7 + 3);
    const spread = lot.zoneId === 'townCore' ? 4.5 : 7.5;
    loot.push({
      id: `offline-${i}`,
      type: LOOT_TYPES[i % LOOT_TYPES.length],
      x: lot.center.x + (((i * 13) % 11) - 5) * spread * 0.22,
      z: lot.center.z + (((i * 17) % 9) - 4) * spread * 0.22,
    });
  }
  return loot;
}

export function createOfflineSpawn(layout: WorldLayout) {
  const candidates = layout.buildingLots.filter((lot) => lot.zoneId === 'westVillage' || lot.zoneId === 'outerHamlets');
  const lot = candidates[6] ?? layout.buildingLots[0];
  return {
    x: lot.center.x,
    y: 10,
    z: lot.center.z,
  };
}

export function createOfflineZone(): ZoneState {
  return { x: 120, z: 260, radius: 1650 };
}

export function shrinkOfflineZone(zone: ZoneState): ZoneState {
  const targetRadius = zone.radius > 600 ? zone.radius - 110 : zone.radius > 320 ? zone.radius - 60 : zone.radius;
  const centerShift = zone.radius > 700 ? 18 : zone.radius > 400 ? 10 : 0;
  return {
    x: zone.x + centerShift,
    z: zone.z - centerShift * 0.4,
    radius: Math.max(280, targetRadius),
  };
}
