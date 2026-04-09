export type ZonePhaseState = {
  phase: number;
  status: 'waiting' | 'shrinking';
  timeRemaining: number;
};

export const INITIAL_ZONE_PHASE: ZonePhaseState = {
  phase: 1,
  status: 'waiting',
  timeRemaining: 40,
};

export function advanceZonePhase(current: ZonePhaseState): ZonePhaseState {
  if (current.status === 'waiting') {
    return {
      phase: current.phase,
      status: 'shrinking',
      timeRemaining: 24,
    };
  }

  return {
    phase: current.phase + 1,
    status: 'waiting',
    timeRemaining: Math.max(16, 34 - current.phase * 2),
  };
}

export function zoneDamageForPhase(phase: number) {
  if (phase <= 1) return 2;
  if (phase <= 3) return 4;
  if (phase <= 5) return 6;
  return 9;
}
