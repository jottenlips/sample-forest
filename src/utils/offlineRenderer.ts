import { Scene, Channel, getTripletStepCount } from '../types';
import { encodeWav } from './wavEncoder';

// ── Types ──────────────────────────────────────────────────────────

interface PlayEvent {
  channelId: number;
  startTime: number;
  buffer: AudioBuffer;
  volume: number;
  rate: number;
}

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

// ── Decode all unique samples ──────────────────────────────────────

export async function decodeAllSamples(
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

// ── Trim an AudioBuffer ────────────────────────────────────────────

function trimBuffer(
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

// ── Determine which channels are audible ───────────────────────────

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

// ── Build play events for a scene ──────────────────────────────────

export function renderScene(
  scene: Scene,
  channels: Channel[],
  sampleBuffers: Map<string, AudioBuffer>,
  ctx: BaseAudioContext,
  offset: number,
): PlayEvent[] {
  const events: PlayEvent[] = [];
  const stepDuration = 60 / scene.bpm / 4; // seconds per step
  const tripletDuration = stepDuration * (2 / 3);
  const swingAmount = (scene.swing / 100) * 0.75;
  const audible = getAudibleChannelIds(channels);
  const tripletStepCount = getTripletStepCount(scene.stepCount);

  for (const ch of channels) {
    if (!audible.has(ch.id)) continue;
    if (!ch.sample) continue;

    const rawBuffer = sampleBuffers.get(ch.sample.uri);
    if (!rawBuffer) continue;

    const trimmed = trimBuffer(
      rawBuffer,
      ch.sample.trimStartMs,
      ch.sample.trimEndMs,
      ctx,
    );

    const volume = ch.sample.volume * ch.volume;
    const rate = ch.sample.playbackRate;

    // Normal steps
    const steps = scene.channelSteps[ch.id] ?? ch.steps;
    for (let i = 0; i < scene.stepCount; i++) {
      if (!steps[i]) continue;
      const isOffbeat = i % 2 === 1;
      const swingDelay = isOffbeat ? swingAmount * stepDuration : 0;
      const time = offset + i * stepDuration + swingDelay;
      events.push({ channelId: ch.id, startTime: time, buffer: trimmed, volume, rate });
    }

    // Triplet steps
    const triplets = scene.channelTripletSteps[ch.id] ?? ch.tripletSteps;
    for (let i = 0; i < tripletStepCount; i++) {
      if (!triplets[i]) continue;
      const time = offset + i * tripletDuration;
      events.push({ channelId: ch.id, startTime: time, buffer: trimmed, volume, rate });
    }
  }

  return events;
}

// ── Calculate scene duration ───────────────────────────────────────

export function sceneDuration(scene: Scene): number {
  return scene.stepCount * (60 / scene.bpm / 4);
}

// ── Schedule events onto an OfflineAudioContext ────────────────────

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

// ── Render the entire song ─────────────────────────────────────────

export async function renderSong(
  songScenes: SongScene[],
  channels: Channel[],
  options: RenderOptions,
): Promise<Map<string, AudioBuffer>> {
  const sampleRate = options.sampleRate ?? 44100;
  const onProgress = options.onProgress ?? (() => {});
  const results = new Map<string, AudioBuffer>();

  if (songScenes.length === 0) return results;

  // Calculate total duration
  let totalDuration = 0;
  for (const ss of songScenes) {
    totalDuration += sceneDuration(ss.scene);
  }
  // Add a small tail for sample ring-out
  const tailSeconds = 2;
  const totalSamples = Math.ceil((totalDuration + tailSeconds) * sampleRate);

  // We need a temporary AudioContext to decode samples
  const tempCtx = new AudioContext({ sampleRate });

  onProgress('Decoding samples...');
  const sampleBuffers = await decodeAllSamples(channels, tempCtx);

  if (options.mode === 'mix' || options.mode === 'stem') {
    // Filter channels for stem mode
    const renderChannels =
      options.mode === 'stem'
        ? channels.filter((ch) => ch.id === options.channelId)
        : channels;

    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    let offset = 0;
    for (let i = 0; i < songScenes.length; i++) {
      onProgress(`Rendering scene ${i + 1} of ${songScenes.length}...`);
      const ss = songScenes[i];
      const events = renderScene(ss.scene, renderChannels, sampleBuffers, offlineCtx, offset);
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
    // stems — render each channel with a sample separately
    const channelsWithSamples = channels.filter((ch) => ch.sample);
    for (let ci = 0; ci < channelsWithSamples.length; ci++) {
      const ch = channelsWithSamples[ci];
      onProgress(`Rendering stem ${ci + 1} of ${channelsWithSamples.length} (${ch.label})...`);

      const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
      let offset = 0;
      for (const ss of songScenes) {
        const events = renderScene(ss.scene, [ch], sampleBuffers, offlineCtx, offset);
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

// ── Download a WAV blob ────────────────────────────────────────────

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
