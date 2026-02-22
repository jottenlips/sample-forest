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
  muted: boolean;
  solo: boolean;
  volume: number;
}

export interface SequencerState {
  bpm: number;
  stepCount: number;
  currentStep: number;
  isPlaying: boolean;
}
