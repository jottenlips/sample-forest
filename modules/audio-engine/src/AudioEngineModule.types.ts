export interface ChannelConfig {
  channelId: number;
  sampleId: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  steps: boolean[];
  tripletSteps: boolean[];
  trimStartMs: number;
  trimEndMs: number;
  playbackRate: number;
}

export interface SequencerConfig {
  bpm: number;
  stepCount: number;
  swing: number;
  channels: ChannelConfig[];
  punchIn: string | null;
  repeatBeatOrigin: number | null;
}

export interface SynthLayerParams {
  waveform: 'sine' | 'square' | 'saw' | 'triangle';
  frequency: number;
  volume: number;
}

export interface LfoParams {
  rate: number;
  depth: number;
  waveform: 'sine' | 'square' | 'saw' | 'triangle';
  target: 'volume' | 'pitch';
}

export interface SynthParams {
  layers: SynthLayerParams[];
  noise: number;
  durationMs: number;
  attackMs: number;
  decayMs: number;
  volume: number;
  lfo: LfoParams | null;
}

export interface SynthResult {
  uri: string;
  durationMs: number;
  waveformData: number[];
}

export interface ImportResult {
  uri: string;
  durationMs: number;
  waveformData: number[];
}

export interface StepChangeEvent {
  currentStep: number;
  currentTripletStep: number;
}

export interface ExportSceneConfig {
  bpm: number;
  stepCount: number;
  swing: number;
  channelSteps: Record<number, boolean[]>;
  channelTripletSteps: Record<number, boolean[]>;
}

export interface ExportParams {
  scenes: ExportSceneConfig[];
  channels: {
    channelId: number;
    sampleId: string;
    volume: number;
    muted: boolean;
    solo: boolean;
    steps: boolean[];
    tripletSteps: boolean[];
    trimStartMs: number;
    trimEndMs: number;
    playbackRate: number;
  }[];
  mode: 'mix' | 'stems' | 'stem';
  channelId?: number;
}

export interface ExportResult {
  label: string;
  uri: string;
}
