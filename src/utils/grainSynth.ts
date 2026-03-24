/**
 * Granular synthesis engine.
 *
 * Takes a source audio buffer (Float32Array PCM) and synthesizes a new sound
 * by extracting, windowing, and overlapping tiny "grains" from it.
 *
 * At slow rates grains create texture; at audio rates (>20Hz) they cross into
 * oscillator territory — the source's spectral character bleeds through,
 * producing unique synth timbres.
 */

import { encodeWavFromSamples } from './oscillator';

const SAMPLE_RATE = 44100;

export type GrainWindow = 'hann' | 'triangle' | 'tukey' | 'smooth';

export interface GrainSynthParams {
  /** Source PCM samples (mono, 44100 Hz) */
  sourceBuffer: Float32Array;
  /** Playback position in source (0–1) */
  position: number;
  /** Grain size in ms (1–500) */
  grainSizeMs: number;
  /** Grains per second — at audio rates (>20 Hz) this becomes pitch */
  grainRate: number;
  /** Random offset around position (0–1) */
  spray: number;
  /** Playback rate of each grain (0.25–4). Controls pitch. */
  pitch: number;
  /** Envelope shape applied to each grain */
  windowShape: GrainWindow;
  /** Total output duration in ms */
  outputDurationMs: number;
  /** Master volume 0–1 */
  volume: number;
  /** Glissando: sweeps position over output duration (-1 to +1, 0 = no sweep) */
  gliss: number;
}

/** Build a window function of given length */
function makeWindow(shape: GrainWindow, length: number): Float32Array {
  const w = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const n = i / (length - 1 || 1);
    switch (shape) {
      case 'hann':
        w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * n));
        break;
      case 'triangle':
        w[i] = 1 - Math.abs(2 * n - 1);
        break;
      case 'tukey': {
        const alpha = 0.5;
        if (n < alpha / 2) {
          w[i] = 0.5 * (1 + Math.cos(Math.PI * (2 * n / alpha - 1)));
        } else if (n > 1 - alpha / 2) {
          w[i] = 0.5 * (1 + Math.cos(Math.PI * (2 * n / alpha - 2 / alpha + 1)));
        } else {
          w[i] = 1;
        }
        break;
      }
      case 'smooth':
        w[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * n) + 0.08 * Math.cos(4 * Math.PI * n);
        break;
    }
  }
  return w;
}

/** Simple seeded-ish random from index for reproducibility in preview */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function synthesizeGrains(params: GrainSynthParams): {
  wavBuffer: ArrayBuffer;
  durationMs: number;
  waveformData: number[];
} {
  const {
    sourceBuffer,
    position,
    grainSizeMs,
    grainRate,
    spray,
    pitch,
    windowShape,
    outputDurationMs,
    volume,
    gliss,
  } = params;

  const outputSamples = Math.floor((outputDurationMs / 1000) * SAMPLE_RATE);
  const output = new Float32Array(outputSamples);

  const grainSizeSamples = Math.max(1, Math.floor((grainSizeMs / 1000) * SAMPLE_RATE));
  const window = makeWindow(windowShape, grainSizeSamples);

  // Interval between grain onsets in output samples
  const grainIntervalSamples = Math.max(1, Math.floor(SAMPLE_RATE / grainRate));

  const sourceLen = sourceBuffer.length;
  const centerSample = Math.floor(position * sourceLen);

  // Max spray range in source samples
  const sprayRange = Math.floor(spray * sourceLen * 0.5);

  let grainIndex = 0;
  for (let onset = 0; onset < outputSamples; onset += grainIntervalSamples) {
    // Sweep position over time via gliss
    const progress = outputSamples > 1 ? onset / (outputSamples - 1) : 0;
    const glissOffset = Math.floor(gliss * progress * sourceLen * 0.5);
    // Randomize read position around center
    const rand = pseudoRandom(grainIndex * 7 + 3) * 2 - 1; // -1 to 1
    const readStart = Math.floor(centerSample + glissOffset + rand * sprayRange);

    for (let i = 0; i < grainSizeSamples; i++) {
      const outIdx = onset + i;
      if (outIdx >= outputSamples) break;

      // Read from source with pitch-shifted index
      const srcIdx = readStart + Math.floor(i * pitch);
      // Wrap around source buffer
      const wrappedIdx = ((srcIdx % sourceLen) + sourceLen) % sourceLen;

      output[outIdx] += sourceBuffer[wrappedIdx] * window[i];
    }

    grainIndex++;
  }

  // Normalize to prevent clipping
  let peak = 0;
  for (let i = 0; i < outputSamples; i++) {
    const abs = Math.abs(output[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) {
    const scale = volume / peak;
    for (let i = 0; i < outputSamples; i++) {
      output[i] *= scale;
    }
  }

  const wavBuffer = encodeWavFromSamples(output);

  // Downsample for waveform display
  const waveformPoints = 80;
  const waveformData: number[] = [];
  const chunkSize = Math.max(1, Math.floor(outputSamples / waveformPoints));
  for (let i = 0; i < waveformPoints; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, outputSamples);
    let maxAbs = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(output[j]);
      if (abs > maxAbs) maxAbs = abs;
    }
    waveformData.push(Math.max(0.05, maxAbs));
  }

  return { wavBuffer, durationMs: outputDurationMs, waveformData };
}

/**
 * Decode a WAV ArrayBuffer into a mono Float32Array at 44100 Hz.
 * Works on web via AudioContext.decodeAudioData and falls back to
 * manual WAV header parsing.
 */
export async function decodeAudioToFloat32(uri: string): Promise<Float32Array> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  // Try Web Audio API decode first
  if (typeof AudioContext !== 'undefined' || typeof (globalThis as any).webkitAudioContext !== 'undefined') {
    const AudioCtx = AudioContext || (globalThis as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: SAMPLE_RATE });
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const mono = audioBuffer.getChannelData(0);
      ctx.close();
      return mono;
    } catch {
      ctx.close();
    }
  }

  // Fallback: parse WAV manually (16-bit PCM only)
  const view = new DataView(arrayBuffer);
  const numChannels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  // Find data chunk
  let dataOffset = 44;
  const dataSize = view.getUint32(40, true);
  const numSamples = dataSize / (bitsPerSample / 8) / numChannels;
  const samples = new Float32Array(numSamples);

  if (bitsPerSample === 16) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const idx = dataOffset + (i * numChannels + ch) * 2;
        sum += view.getInt16(idx, true) / 32768;
      }
      samples[i] = sum / numChannels;
    }
  }

  return samples;
}
