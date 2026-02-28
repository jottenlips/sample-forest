export interface Sample {
  id: string;
  uri: string;
  name: string;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  playbackRate: number;
  preservePitch: boolean;
  volume: number;
  waveformData: number[];
}

export interface Channel {
  id: number;
  label: string;
  sample: Sample | null;
  steps: boolean[];
  tripletSteps: boolean[];
  muted: boolean;
  solo: boolean;
  volume: number;
}

export function getTripletStepCount(stepCount: number): number {
  // 3 triplet steps for every 2 normal steps
  return Math.floor(stepCount * 3 / 2);
}

export function getTripletLabel(stepCount: number): string {
  // 8 steps → 8t, 16 → 16t, 24 → 24t, 32 → 32t
  return `${stepCount}t`;
}

export interface SequencerState {
  bpm: number;
  stepCount: number;
  currentStep: number;
  currentTripletStep: number;
  isPlaying: boolean;
  swing: number; // 0 (straight) to 100 (max swing)
}

export type PunchInEffect = 'repeat' | 'double' | 'half' | 'swap' | null;

export interface Scene {
  id: number;
  name: string;
  // Snapshot of each channel's step pattern, keyed by channel id
  channelSteps: Record<number, boolean[]>;
  channelTripletSteps: Record<number, boolean[]>;
  bpm: number;
  stepCount: number;
  swing: number;
}
