/**
 * Pure math oscillator audio generation.
 * No AudioBuffer dependency — generates Float32Array PCM samples directly.
 */

export type Waveform = 'sine' | 'square' | 'saw' | 'triangle';

export interface OscillatorParams {
  waveform: Waveform;
  frequency: number;
  durationMs: number;
  attackMs: number;
  decayMs: number;
  volume: number; // 0–1
}

export interface OscillatorLayer {
  waveform: Waveform;
  frequency: number;
  volume: number; // 0–1 per-layer volume
}

export interface LfoParams {
  rate: number;       // Hz (0.1–20)
  depth: number;      // 0–1
  waveform: Waveform; // reuse existing sine/square/saw/triangle
  target: 'volume' | 'pitch';
}

export interface MultiOscillatorParams {
  layers: OscillatorLayer[];
  noise: number; // 0–1 white noise level
  durationMs: number;
  attackMs: number;
  decayMs: number;
  volume: number; // 0–1 master volume
  lfo: LfoParams | null;
}

export interface NoteFrequency {
  note: string;
  frequency: number;
}

// C2–C6 chromatic scale
export const NOTE_FREQUENCIES: NoteFrequency[] = (() => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notes: NoteFrequency[] = [];
  for (let octave = 2; octave <= 6; octave++) {
    for (let i = 0; i < 12; i++) {
      if (octave === 6 && i > 0) break; // Stop at C6
      const semitone = (octave - 4) * 12 + i - 9; // semitones from A4
      const frequency = 440 * Math.pow(2, semitone / 12);
      notes.push({ note: `${noteNames[i]}${octave}`, frequency: Math.round(frequency * 100) / 100 });
    }
  }
  return notes;
})();

const SAMPLE_RATE = 44100;

/**
 * Generate raw PCM samples for a waveform with AD envelope.
 */
export function generateOscillator(params: OscillatorParams): Float32Array {
  const { waveform, frequency, durationMs, attackMs, decayMs, volume } = params;
  const numSamples = Math.floor((durationMs / 1000) * SAMPLE_RATE);
  const samples = new Float32Array(numSamples);

  const attackSamples = Math.floor((attackMs / 1000) * SAMPLE_RATE);
  const decaySamples = Math.floor((decayMs / 1000) * SAMPLE_RATE);
  const decayStart = numSamples - decaySamples;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const phase = (frequency * t) % 1;

    // Waveform value in [-1, 1]
    let value: number;
    switch (waveform) {
      case 'sine':
        value = Math.sin(2 * Math.PI * phase);
        break;
      case 'square':
        value = phase < 0.5 ? 1 : -1;
        break;
      case 'saw':
        value = 2 * phase - 1;
        break;
      case 'triangle':
        value = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
        break;
    }

    // AD envelope
    let envelope = 1;
    if (i < attackSamples && attackSamples > 0) {
      envelope = i / attackSamples;
    } else if (i >= decayStart && decaySamples > 0) {
      envelope = (numSamples - i) / decaySamples;
    }

    samples[i] = value * envelope * volume;
  }

  return samples;
}

/**
 * Generate raw PCM samples for multiple oscillator layers mixed together with AD envelope.
 */
function computeWaveform(waveform: Waveform, phase: number): number {
  switch (waveform) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'saw':
      return 2 * phase - 1;
    case 'triangle':
      return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
  }
}

export function generateMultiOscillator(params: MultiOscillatorParams): Float32Array {
  const { layers, noise, durationMs, attackMs, decayMs, volume, lfo } = params;
  const numSamples = Math.floor((durationMs / 1000) * SAMPLE_RATE);
  const samples = new Float32Array(numSamples);

  const attackSamples = Math.floor((attackMs / 1000) * SAMPLE_RATE);
  const decaySamples = Math.floor((decayMs / 1000) * SAMPLE_RATE);
  const decayStart = numSamples - decaySamples;

  // Count sources for normalization (layers + noise if present)
  const sourceCount = layers.length + (noise > 0 ? 1 : 0);
  const norm = sourceCount > 0 ? sourceCount : 1;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;

    // Compute LFO value (-1 to 1)
    let lfoVal = 0;
    if (lfo) {
      const lfoPhase = (lfo.rate * t) % 1;
      lfoVal = computeWaveform(lfo.waveform, lfoPhase);
    }

    let mixed = 0;
    for (const layer of layers) {
      // For pitch target, modulate frequency; otherwise use base frequency
      const freq = lfo && lfo.target === 'pitch'
        ? layer.frequency * (1 + lfoVal * lfo.depth * 0.1)
        : layer.frequency;
      const phase = (freq * t) % 1;
      mixed += computeWaveform(layer.waveform, phase) * layer.volume;
    }

    // White noise
    if (noise > 0) {
      mixed += (Math.random() * 2 - 1) * noise;
    }

    // LFO volume modulation (tremolo)
    if (lfo && lfo.target === 'volume') {
      mixed *= 1 - lfo.depth + lfo.depth * (lfoVal * 0.5 + 0.5);
    }

    // AD envelope
    let envelope = 1;
    if (i < attackSamples && attackSamples > 0) {
      envelope = i / attackSamples;
    } else if (i >= decayStart && decaySamples > 0) {
      envelope = (numSamples - i) / decaySamples;
    }

    samples[i] = (mixed / norm) * envelope * volume;
  }

  return samples;
}

/**
 * Encode Float32Array PCM samples as a WAV ArrayBuffer (44-byte header + 16-bit PCM).
 */
export function encodeWavFromSamples(samples: Float32Array, sampleRate: number = SAMPLE_RATE): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, headerSize - 8 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = headerSize;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Synthesize a waveform: generate PCM, encode WAV, and downsample for waveform display.
 */
export function synthesize(params: OscillatorParams): {
  wavBuffer: ArrayBuffer;
  durationMs: number;
  waveformData: number[];
} {
  const samples = generateOscillator(params);
  const wavBuffer = encodeWavFromSamples(samples);

  // Downsample to ~50 points for waveform display
  const waveformPoints = 50;
  const waveformData: number[] = [];
  const chunkSize = Math.max(1, Math.floor(samples.length / waveformPoints));
  for (let i = 0; i < waveformPoints; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, samples.length);
    let maxAbs = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > maxAbs) maxAbs = abs;
    }
    waveformData.push(Math.max(0.05, maxAbs)); // minimum visible height
  }

  return { wavBuffer, durationMs: params.durationMs, waveformData };
}

/**
 * Synthesize multiple oscillator layers: generate PCM, encode WAV, downsample for display.
 */
export function synthesizeMulti(params: MultiOscillatorParams): {
  wavBuffer: ArrayBuffer;
  durationMs: number;
  waveformData: number[];
} {
  const samples = generateMultiOscillator(params);
  const wavBuffer = encodeWavFromSamples(samples);

  const waveformPoints = 50;
  const waveformData: number[] = [];
  const chunkSize = Math.max(1, Math.floor(samples.length / waveformPoints));
  for (let i = 0; i < waveformPoints; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, samples.length);
    let maxAbs = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > maxAbs) maxAbs = abs;
    }
    waveformData.push(Math.max(0.05, maxAbs));
  }

  return { wavBuffer, durationMs: params.durationMs, waveformData };
}
