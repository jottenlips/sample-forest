import { Platform, Share } from 'react-native';
import { Scene, Channel, getTripletStepCount } from '../types';
import { encodeWav } from './wavEncoder';
import { DecodedAudio, decodeAudioFile } from './audioDecoder';
import { encodeWavFromSamples } from './oscillator';

// ── Types ──────────────────────────────────────────────────────────

export type ExportMode = 'mix' | 'stems' | 'stem';

export interface RenderOptions {
  mode: ExportMode;
  channelId?: number; // required when mode === 'stem'
  sampleRate?: number;
  onProgress?: (message: string) => void;
}

export interface SongScene {
  sceneId: number;
  scene: Scene;
}

// ── Shared helpers ─────────────────────────────────────────────────

export function sceneDuration(scene: Scene): number {
  return scene.stepCount * (60 / scene.bpm / 4);
}

function getAudibleChannelIds(channels: Channel[]): Set<number> {
  const hasSolo = channels.some((ch) => ch.solo);
  const audible = new Set<number>();
  for (const ch of channels) {
    if (ch.muted) continue;
    if (hasSolo && !ch.solo) continue;
    if (!ch.sample) continue;
    audible.add(ch.id);
  }
  return audible;
}

// ══════════════════════════════════════════════════════════════════════
// WEB PATH — uses AudioContext / OfflineAudioContext
// ══════════════════════════════════════════════════════════════════════

interface PlayEvent {
  channelId: number;
  startTime: number;
  buffer: AudioBuffer;
  volume: number;
  rate: number;
}

async function decodeAllSamplesWeb(
  channels: Channel[],
  audioCtx: BaseAudioContext,
): Promise<Map<string, AudioBuffer>> {
  const buffers = new Map<string, AudioBuffer>();
  const pending: Promise<void>[] = [];

  for (const ch of channels) {
    if (!ch.sample) continue;
    const uri = ch.sample.uri;
    if (buffers.has(uri)) continue;

    const p = (async () => {
      const response = await fetch(uri);
      const arrayBuf = await response.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      buffers.set(uri, decoded);
    })();
    pending.push(p);
  }

  await Promise.all(pending);
  return buffers;
}

function trimBufferWeb(
  source: AudioBuffer,
  trimStartMs: number,
  trimEndMs: number,
  ctx: BaseAudioContext,
): AudioBuffer {
  const sr = source.sampleRate;
  const startSample = Math.round((trimStartMs / 1000) * sr);
  const endSample = Math.round((trimEndMs / 1000) * sr);
  const length = Math.max(1, endSample - startSample);

  const trimmed = ctx.createBuffer(source.numberOfChannels, length, sr);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const src = source.getChannelData(c);
    const dst = trimmed.getChannelData(c);
    for (let i = 0; i < length; i++) {
      dst[i] = src[startSample + i] ?? 0;
    }
  }
  return trimmed;
}

function buildWebEvents(
  scene: Scene,
  channels: Channel[],
  sampleBuffers: Map<string, AudioBuffer>,
  ctx: BaseAudioContext,
  offset: number,
): PlayEvent[] {
  const events: PlayEvent[] = [];
  const stepDuration = 60 / scene.bpm / 4;
  const tripletDuration = stepDuration * (2 / 3);
  const swingAmount = (scene.swing / 100) * 0.75;
  const audible = getAudibleChannelIds(channels);
  const tripletStepCount = getTripletStepCount(scene.stepCount);

  for (const ch of channels) {
    if (!audible.has(ch.id)) continue;
    if (!ch.sample) continue;

    const rawBuffer = sampleBuffers.get(ch.sample.uri);
    if (!rawBuffer) continue;

    const trimmed = trimBufferWeb(rawBuffer, ch.sample.trimStartMs, ch.sample.trimEndMs, ctx);
    const volume = ch.sample.volume * ch.volume;
    const rate = ch.sample.playbackRate;

    const steps = scene.channelSteps[ch.id] ?? ch.steps;
    for (let i = 0; i < scene.stepCount; i++) {
      if (!steps[i]) continue;
      const isOffbeat = i % 2 === 1;
      const swingDelay = isOffbeat ? swingAmount * stepDuration : 0;
      const time = offset + i * stepDuration + swingDelay;
      events.push({ channelId: ch.id, startTime: time, buffer: trimmed, volume, rate });
    }

    const triplets = scene.channelTripletSteps[ch.id] ?? ch.tripletSteps;
    for (let i = 0; i < tripletStepCount; i++) {
      if (!triplets[i]) continue;
      const time = offset + i * tripletDuration;
      events.push({ channelId: ch.id, startTime: time, buffer: trimmed, volume, rate });
    }
  }

  return events;
}

function scheduleEvents(events: PlayEvent[], ctx: OfflineAudioContext) {
  for (const ev of events) {
    const source = ctx.createBufferSource();
    source.buffer = ev.buffer;
    source.playbackRate.value = ev.rate;

    const gain = ctx.createGain();
    gain.gain.value = ev.volume;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ev.startTime);
  }
}

export async function renderSong(
  songScenes: SongScene[],
  channels: Channel[],
  options: RenderOptions,
): Promise<Map<string, AudioBuffer>> {
  const sampleRate = options.sampleRate ?? 44100;
  const onProgress = options.onProgress ?? (() => {});
  const results = new Map<string, AudioBuffer>();

  if (songScenes.length === 0) return results;

  let totalDuration = 0;
  for (const ss of songScenes) {
    totalDuration += sceneDuration(ss.scene);
  }
  const tailSeconds = 2;
  const totalSamples = Math.ceil((totalDuration + tailSeconds) * sampleRate);

  const tempCtx = new AudioContext({ sampleRate });

  onProgress('Decoding samples...');
  const sampleBuffers = await decodeAllSamplesWeb(channels, tempCtx);

  if (options.mode === 'mix' || options.mode === 'stem') {
    const renderChannels =
      options.mode === 'stem'
        ? channels.filter((ch) => ch.id === options.channelId)
        : channels;

    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    let offset = 0;
    for (let i = 0; i < songScenes.length; i++) {
      onProgress(`Rendering scene ${i + 1} of ${songScenes.length}...`);
      const ss = songScenes[i];
      const events = buildWebEvents(ss.scene, renderChannels, sampleBuffers, offlineCtx, offset);
      scheduleEvents(events, offlineCtx);
      offset += sceneDuration(ss.scene);
    }

    const rendered = await offlineCtx.startRendering();
    const label =
      options.mode === 'stem'
        ? channels.find((ch) => ch.id === options.channelId)?.label ?? 'stem'
        : 'mix';
    results.set(label, rendered);
  } else {
    const channelsWithSamples = channels.filter((ch) => ch.sample);
    for (let ci = 0; ci < channelsWithSamples.length; ci++) {
      const ch = channelsWithSamples[ci];
      onProgress(`Rendering stem ${ci + 1} of ${channelsWithSamples.length} (${ch.label})...`);

      const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
      let offset = 0;
      for (const ss of songScenes) {
        const events = buildWebEvents(ss.scene, [ch], sampleBuffers, offlineCtx, offset);
        scheduleEvents(events, offlineCtx);
        offset += sceneDuration(ss.scene);
      }
      const rendered = await offlineCtx.startRendering();
      results.set(ch.label, rendered);
    }
  }

  tempCtx.close();
  return results;
}

export function downloadWav(audioBuffer: AudioBuffer, filename: string) {
  const blob = encodeWav(audioBuffer, 0, audioBuffer.length);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════════════
// NATIVE PATH — pure JS mixing
// ══════════════════════════════════════════════════════════════════════

interface NativePlayEvent {
  channelId: number;
  startSample: number; // offset in output buffer
  samples: Float32Array; // resampled + trimmed PCM
  volume: number;
}

async function decodeAllSamplesNative(
  channels: Channel[],
): Promise<Map<string, DecodedAudio>> {
  const buffers = new Map<string, DecodedAudio>();
  const pending: Promise<void>[] = [];

  for (const ch of channels) {
    if (!ch.sample) continue;
    const uri = ch.sample.uri;
    if (buffers.has(uri)) continue;

    const p = (async () => {
      const decoded = await decodeAudioFile(uri);
      buffers.set(uri, decoded);
    })();
    pending.push(p);
  }

  await Promise.all(pending);
  return buffers;
}

function resample(input: Float32Array, rate: number): Float32Array {
  if (rate === 1) return input;
  const outputLength = Math.floor(input.length / rate);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * rate;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIndex - lo;
    output[i] = input[lo] * (1 - frac) + input[hi] * frac;
  }
  return output;
}

function trimAndResample(
  audio: DecodedAudio,
  trimStartMs: number,
  trimEndMs: number,
  rate: number,
): Float32Array {
  const sr = audio.sampleRate;
  const startSample = Math.round((trimStartMs / 1000) * sr);
  const endSample = Math.min(Math.round((trimEndMs / 1000) * sr), audio.length);
  const channelData = audio.getChannelData(0); // mono mix from first channel

  const trimmed = channelData.subarray(startSample, endSample);
  return resample(trimmed, rate);
}

function buildNativeEvents(
  scene: Scene,
  channels: Channel[],
  sampleBuffers: Map<string, DecodedAudio>,
  sampleRate: number,
  offsetSamples: number,
): NativePlayEvent[] {
  const events: NativePlayEvent[] = [];
  const stepDuration = 60 / scene.bpm / 4;
  const tripletDuration = stepDuration * (2 / 3);
  const swingAmount = (scene.swing / 100) * 0.75;
  const audible = getAudibleChannelIds(channels);
  const tripletStepCount = getTripletStepCount(scene.stepCount);

  for (const ch of channels) {
    if (!audible.has(ch.id)) continue;
    if (!ch.sample) continue;

    const decoded = sampleBuffers.get(ch.sample.uri);
    if (!decoded) continue;

    const samples = trimAndResample(
      decoded,
      ch.sample.trimStartMs,
      ch.sample.trimEndMs,
      ch.sample.playbackRate,
    );
    const volume = ch.sample.volume * ch.volume;

    const steps = scene.channelSteps[ch.id] ?? ch.steps;
    for (let i = 0; i < scene.stepCount; i++) {
      if (!steps[i]) continue;
      const isOffbeat = i % 2 === 1;
      const swingDelay = isOffbeat ? swingAmount * stepDuration : 0;
      const time = i * stepDuration + swingDelay;
      const startSample = offsetSamples + Math.round(time * sampleRate);
      events.push({ channelId: ch.id, startSample, samples, volume });
    }

    const triplets = scene.channelTripletSteps[ch.id] ?? ch.tripletSteps;
    for (let i = 0; i < tripletStepCount; i++) {
      if (!triplets[i]) continue;
      const time = i * tripletDuration;
      const startSample = offsetSamples + Math.round(time * sampleRate);
      events.push({ channelId: ch.id, startSample, samples, volume });
    }
  }

  return events;
}

function mixEvents(events: NativePlayEvent[], totalSamples: number): Float32Array {
  const output = new Float32Array(totalSamples);
  for (const ev of events) {
    for (let i = 0; i < ev.samples.length; i++) {
      const outIdx = ev.startSample + i;
      if (outIdx >= totalSamples) break;
      if (outIdx < 0) continue;
      output[outIdx] += ev.samples[i] * ev.volume;
    }
  }
  // Soft clip to prevent distortion
  for (let i = 0; i < output.length; i++) {
    if (output[i] > 1) output[i] = 1;
    else if (output[i] < -1) output[i] = -1;
  }
  return output;
}

export async function renderSongNative(
  songScenes: SongScene[],
  channels: Channel[],
  options: RenderOptions,
): Promise<Map<string, Float32Array>> {
  const sampleRate = options.sampleRate ?? 44100;
  const onProgress = options.onProgress ?? (() => {});
  const results = new Map<string, Float32Array>();

  if (songScenes.length === 0) return results;

  let totalDuration = 0;
  for (const ss of songScenes) {
    totalDuration += sceneDuration(ss.scene);
  }
  const tailSeconds = 2;
  const totalSamples = Math.ceil((totalDuration + tailSeconds) * sampleRate);

  onProgress('Decoding samples...');
  const sampleBuffers = await decodeAllSamplesNative(channels);

  if (options.mode === 'mix' || options.mode === 'stem') {
    const renderChannels =
      options.mode === 'stem'
        ? channels.filter((ch) => ch.id === options.channelId)
        : channels;

    const allEvents: NativePlayEvent[] = [];
    let offsetSamples = 0;
    for (let i = 0; i < songScenes.length; i++) {
      onProgress(`Rendering scene ${i + 1} of ${songScenes.length}...`);
      const ss = songScenes[i];
      const events = buildNativeEvents(ss.scene, renderChannels, sampleBuffers, sampleRate, offsetSamples);
      allEvents.push(...events);
      offsetSamples += Math.round(sceneDuration(ss.scene) * sampleRate);
    }

    const mixed = mixEvents(allEvents, totalSamples);
    const label =
      options.mode === 'stem'
        ? channels.find((ch) => ch.id === options.channelId)?.label ?? 'stem'
        : 'mix';
    results.set(label, mixed);
  } else {
    const channelsWithSamples = channels.filter((ch) => ch.sample);
    for (let ci = 0; ci < channelsWithSamples.length; ci++) {
      const ch = channelsWithSamples[ci];
      onProgress(`Rendering stem ${ci + 1} of ${channelsWithSamples.length} (${ch.label})...`);

      const allEvents: NativePlayEvent[] = [];
      let offsetSamples = 0;
      for (const ss of songScenes) {
        const events = buildNativeEvents(ss.scene, [ch], sampleBuffers, sampleRate, offsetSamples);
        allEvents.push(...events);
        offsetSamples += Math.round(sceneDuration(ss.scene) * sampleRate);
      }
      const mixed = mixEvents(allEvents, totalSamples);
      results.set(ch.label, mixed);
    }
  }

  return results;
}

/** Encode Float32Array as WAV, save to disk, open share sheet */
export async function shareWavNative(
  samples: Float32Array,
  sampleRate: number,
  filename: string,
): Promise<void> {
  const wavBuffer = encodeWavFromSamples(samples, sampleRate);

  const { Paths, Directory, File } = await import('expo-file-system');
  const exportDir = new Directory(Paths.document, 'exports');
  if (!exportDir.exists) {
    exportDir.create();
  }

  const safeName = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  const file = new File(exportDir, safeName);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(wavBuffer));

  await Share.share({ url: file.uri });
}
