/**
 * Web Audio API engine for precise sequencer playback.
 *
 * Uses AudioContext.currentTime (hardware clock) for sample-accurate scheduling.
 * The scheduling "pump" (setInterval) can be imprecise — it just needs to fire
 * often enough to keep the look-ahead buffer filled. The actual audio timing
 * comes from AudioBufferSourceNode.start(exactTime), which is guaranteed
 * to fire at exactly the right sample.
 *
 * This replaces expo-av (HTMLAudioElement wrapper) for web playback.
 */

class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();

  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (globalThis as any).AudioContext() as AudioContext;
    }
    return this.ctx!;
  }

  get currentTime(): number {
    return this.getContext().currentTime;
  }

  async resume(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  async loadSample(sampleId: string, uri: string): Promise<void> {
    const ctx = this.getContext();
    try {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(sampleId, audioBuffer);
    } catch (err) {
      console.error(`WebAudioEngine: failed to load sample ${sampleId}:`, err);
    }
  }

  unloadSample(sampleId: string): void {
    this.buffers.delete(sampleId);
  }

  hasSample(sampleId: string): boolean {
    return this.buffers.has(sampleId);
  }

  /**
   * Schedule a sample to play at a precise AudioContext time.
   * This is sample-accurate — the audio hardware ensures exact timing.
   */
  scheduleSample(
    sampleId: string,
    when: number,
    volume: number,
    playbackRate: number,
    trimStartMs: number,
    trimEndMs: number,
    durationMs: number,
  ): void {
    const ctx = this.getContext();
    const buffer = this.buffers.get(sampleId);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(ctx.destination);

    const offset = trimStartMs / 1000;
    if (trimEndMs > 0 && trimEndMs < durationMs) {
      const duration = (trimEndMs - trimStartMs) / 1000;
      source.start(when, offset, duration);
    } else {
      source.start(when, offset);
    }
  }

  /** Play a sample immediately (for preview / tap). */
  triggerSample(
    sampleId: string,
    volume: number,
    playbackRate: number,
    trimStartMs: number,
    trimEndMs: number,
    durationMs: number,
  ): void {
    this.scheduleSample(sampleId, 0, volume, playbackRate, trimStartMs, trimEndMs, durationMs);
  }
}

export const webAudioEngine = new WebAudioEngine();
