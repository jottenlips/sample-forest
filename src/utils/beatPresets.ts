/**
 * Classic beat presets: each defines drum channels with synth params, step patterns, BPM, and swing.
 */
import { MultiOscillatorParams } from './oscillator';

export interface DrumChannel {
  label: string;
  synth: MultiOscillatorParams;
  steps: boolean[];
  volume: number;
}

export interface BeatPreset {
  label: string;
  bpm: number;
  swing: number;
  channels: DrumChannel[];
}

// --- Drum sound definitions ---

const kick: MultiOscillatorParams = {
  layers: [{ waveform: 'sine', frequency: 65, volume: 1.0 }],
  noise: 0.05,
  durationMs: 200,
  attackMs: 2,
  decayMs: 180,
  volume: 0.9,
  lfo: null,
};

const snare: MultiOscillatorParams = {
  layers: [{ waveform: 'triangle', frequency: 200, volume: 0.6 }],
  noise: 0.7,
  durationMs: 150,
  attackMs: 0,
  decayMs: 140,
  volume: 0.8,
  lfo: null,
};

const closedHat: MultiOscillatorParams = {
  layers: [{ waveform: 'square', frequency: 8000, volume: 0.3 }],
  noise: 0.9,
  durationMs: 60,
  attackMs: 0,
  decayMs: 50,
  volume: 0.7,
  lfo: null,
};

const openHat: MultiOscillatorParams = {
  layers: [{ waveform: 'square', frequency: 8000, volume: 0.3 }],
  noise: 0.8,
  durationMs: 200,
  attackMs: 0,
  decayMs: 180,
  volume: 0.6,
  lfo: null,
};

const rim: MultiOscillatorParams = {
  layers: [{ waveform: 'triangle', frequency: 1000, volume: 0.8 }],
  noise: 0.15,
  durationMs: 40,
  attackMs: 0,
  decayMs: 35,
  volume: 0.7,
  lfo: null,
};

const clap: MultiOscillatorParams = {
  layers: [{ waveform: 'triangle', frequency: 400, volume: 0.3 }],
  noise: 1.0,
  durationMs: 100,
  attackMs: 5,
  decayMs: 90,
  volume: 0.75,
  lfo: null,
};

const ride: MultiOscillatorParams = {
  layers: [
    { waveform: 'triangle', frequency: 5000, volume: 0.4 },
    { waveform: 'square', frequency: 7000, volume: 0.2 },
  ],
  noise: 0.5,
  durationMs: 300,
  attackMs: 0,
  decayMs: 280,
  volume: 0.5,
  lfo: null,
};

const tom: MultiOscillatorParams = {
  layers: [{ waveform: 'sine', frequency: 150, volume: 0.9 }],
  noise: 0.1,
  durationMs: 150,
  attackMs: 2,
  decayMs: 140,
  volume: 0.8,
  lfo: null,
};

const conga: MultiOscillatorParams = {
  layers: [{ waveform: 'sine', frequency: 250, volume: 0.8 }],
  noise: 0.2,
  durationMs: 120,
  attackMs: 0,
  decayMs: 110,
  volume: 0.7,
  lfo: null,
};

const shaker: MultiOscillatorParams = {
  layers: [],
  noise: 0.9,
  durationMs: 50,
  attackMs: 0,
  decayMs: 45,
  volume: 0.5,
  lfo: null,
};

// --- Helper ---
function s(pattern: string): boolean[] {
  return pattern.split('').map((c) => c === 'x');
}

// --- Beat presets ---

export const BEAT_PRESETS: BeatPreset[] = [
  {
    label: 'Disco',
    bpm: 120,
    swing: 0,
    channels: [
      { label: 'Kick',    synth: kick,      steps: s('x.......x.......'), volume: 0.9 },
      { label: 'Cl Hat',  synth: closedHat, steps: s('..x.......x.....'), volume: 0.6 },
      { label: 'Snare',   synth: snare,     steps: s('....x.......x...'), volume: 0.8 },
      { label: 'Op Hat',  synth: openHat,   steps: s('......x.......x.'), volume: 0.45 },
    ],
  },
  {
    label: 'Reggaeton',
    bpm: 95,
    swing: 0,
    channels: [
      { label: 'Kick',    synth: kick,      steps: s('x..x..x.x..x..x.'), volume: 0.9 },
      { label: 'Snare',   synth: snare,     steps: s('....x.......x...'), volume: 0.8 },
      { label: 'Cl Hat',  synth: closedHat, steps: s('x.x.x.x.x.x.x.x.'), volume: 0.6 },
      { label: 'Rim',     synth: rim,       steps: s('..x...x...x...x.'), volume: 0.5 },
    ],
  },
  {
    label: 'Breakbeat',
    bpm: 138,
    swing: 0,
    channels: [
      { label: 'Kick',    synth: kick,      steps: s('x.....x...x.....'), volume: 0.9 },
      { label: 'Snare',   synth: snare,     steps: s('....x.......x.x.'), volume: 0.85 },
      { label: 'Cl Hat',  synth: closedHat, steps: s('x.x.x.x.x.x.x.x.'), volume: 0.6 },
      { label: 'Op Hat',  synth: openHat,   steps: s('......x.........'), volume: 0.5 },
    ],
  },
  {
    label: 'Samba',
    bpm: 100,
    swing: 0,
    channels: [
      { label: 'Kick',    synth: kick,      steps: s('x..x..x...x..x..'), volume: 0.85 },
      { label: 'Snare',   synth: snare,     steps: s('..x...x...x...x.'), volume: 0.7 },
      { label: 'Cl Hat',  synth: closedHat, steps: s('x.xxx.xxx.xxx.xx'), volume: 0.55 },
      { label: 'Shaker',  synth: shaker,    steps: s('.x.x.x.x.x.x.x.x'), volume: 0.4 },
    ],
  },
  {
    label: 'Bossa',
    bpm: 140,
    swing: 0,
    channels: [
      { label: 'Kick',    synth: kick,      steps: s('x..x..x...x..x..'), volume: 0.8 },
      { label: 'Rim',     synth: rim,       steps: s('x..x..x.x..x..x.'), volume: 0.65 },
      { label: 'Cl Hat',  synth: closedHat, steps: s('x.x.x.x.x.x.x.x.'), volume: 0.5 },
      { label: 'Conga',   synth: conga,     steps: s('..x..x....x..x..'), volume: 0.5 },
    ],
  },
  {
    label: 'Jazz',
    bpm: 120,
    swing: 65,
    channels: [
      { label: 'Kick',    synth: kick,      steps: s('x.......x.......'), volume: 0.7 },
      { label: 'Snare',   synth: snare,     steps: s('....x.......x...'), volume: 0.6 },
      { label: 'Ride',    synth: ride,      steps: s('x..x..x.x..x..x.'), volume: 0.6 },
      { label: 'Cl Hat',  synth: closedHat, steps: s('..x...x...x...x.'), volume: 0.4 },
    ],
  },
  {
    label: 'Dilla',
    bpm: 86,
    swing: 45,
    channels: [
      { label: 'Kick',    synth: kick,      steps: s('x..x....x...x...'), volume: 0.9 },
      { label: 'Snare',   synth: snare,     steps: s('....x..x....x...'), volume: 0.8 },
      { label: 'Cl Hat',  synth: closedHat, steps: s('x.x.x.x.x.x.x.x.'), volume: 0.55 },
      { label: 'Clap',    synth: clap,      steps: s('........x.......'), volume: 0.5 },
    ],
  },
];
