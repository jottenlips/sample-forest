/**
 * Web Audio API engine for precise sequencer playback.
 *
 * Uses AudioContext.currentTime (hardware clock) for sample-accurate scheduling.
 * The scheduling "pump" (setInterval) can be imprecise — it just needs to fire
 * often enough to keep the look-ahead buffer filled. The actual audio timing
 * comes from AudioBufferSourceNode.start(exactTime), which is guaranteed
 * to fire at exactly the right sample.
 *
 * iOS Safari quirk: AudioContext starts in "suspended" state and can ONLY
 * be resumed inside a user gesture (touchstart/click). We handle this by:
 * 1. Deferring AudioContext creation until first user interaction
 * 2. Playing a silent buffer to fully "unlock" iOS audio output
 * 3. Storing raw ArrayBuffers if samples are loaded before context is ready
 */

class WebAudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private unlocked = false;
  // Store raw data for samples loaded before context is unlocked
  private pendingLoads = new Map<string, ArrayBuffer>();

  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (globalThis as any).AudioContext() as AudioContext;
    }
    return this.ctx!;
  }

  get currentTime(): number {
    return this.getContext().currentTime;
  }

  /**
   * Resume the AudioContext. MUST be called from a user gesture handler
   * on iOS Safari (e.g. play button tap). Plays a silent buffer to
   * fully unlock iOS audio output.
   */
  async resume(): Promise<void> {
    const ctx = this.getContext();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Play a silent buffer to fully unlock iOS Safari audio
    if (!this.unlocked) {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
      this.unlocked = true;

      // Decode any samples that were loaded before unlock
      if (this.pendingLoads.size > 0) {
        const pending = Array.from(this.pendingLoads.entries());
        this.pendingLoads.clear();
        await Promise.all(
          pending.map(async ([sampleId, rawData]) => {
            try {
              // decodeAudioData consumes the ArrayBuffer, need a copy
              const audioBuffer = await ctx.decodeAudioData(rawData);
              this.buffers.set(sampleId, audioBuffer);
            } catch (err) {
              console.error(`WebAudioEngine: failed to decode pending sample ${sampleId}:`, err);
            }
          }),
        );
      }
    }
  }

  async loadSample(sampleId: string, uri: string): Promise<void> {
    try {
      const response = await fetch(uri);
      const rawData = await response.arrayBuffer();

      const ctx = this.ctx;
      if (ctx && ctx.state === 'running') {
        // Context is ready — decode immediately
        const audioBuffer = await ctx.decodeAudioData(rawData);
        this.buffers.set(sampleId, audioBuffer);
      } else {
        // Context not ready yet (suspended or not created).
        // Store raw data; will be decoded when resume() is called.
        this.pendingLoads.set(sampleId, rawData);
      }
    } catch (err) {
      console.error(`WebAudioEngine: failed to load sample ${sampleId}:`, err);
    }
  }

  unloadSample(sampleId: string): void {
    this.buffers.delete(sampleId);
    this.pendingLoads.delete(sampleId);
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
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

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
