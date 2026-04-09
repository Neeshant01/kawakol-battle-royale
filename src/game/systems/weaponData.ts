export type WeaponId = 'AR' | 'SMG' | 'Sniper' | 'Shotgun';
export type FireMode = 'Auto' | 'Semi' | 'Pump';

export type WeaponStats = {
  id: WeaponId;
  label: string;
  ammoLabel: string;
  magSize: number;
  reserveAmmo: number;
  reloadMs: number;
  fireMode: FireMode;
  damage: number;
};

export const WEAPON_CATALOG: Record<WeaponId, WeaponStats> = {
  AR: {
    id: 'AR',
    label: 'KMR-47',
    ammoLabel: '7.62',
    magSize: 30,
    reserveAmmo: 120,
    reloadMs: 2100,
    fireMode: 'Auto',
    damage: 33,
  },
  SMG: {
    id: 'SMG',
    label: 'M-9C',
    ammoLabel: '9mm',
    magSize: 32,
    reserveAmmo: 160,
    reloadMs: 1800,
    fireMode: 'Auto',
    damage: 23,
  },
  Sniper: {
    id: 'Sniper',
    label: 'Ridge-72',
    ammoLabel: '7.62',
    magSize: 5,
    reserveAmmo: 35,
    reloadMs: 2600,
    fireMode: 'Semi',
    damage: 82,
  },
  Shotgun: {
    id: 'Shotgun',
    label: 'Gaon Guard',
    ammoLabel: '12g',
    magSize: 6,
    reserveAmmo: 30,
    reloadMs: 2400,
    fireMode: 'Pump',
    damage: 68,
  },
};

export function isWeaponId(value: string | null): value is WeaponId {
  return value === 'AR' || value === 'SMG' || value === 'Sniper' || value === 'Shotgun';
}
