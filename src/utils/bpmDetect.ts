/**
 * Simple BPM detection using energy-based onset detection + autocorrelation.
 * Analyzes the audio buffer and returns an estimated BPM.
 */
export function detectBpm(audioBuffer: { getChannelData(ch: number): Float32Array; sampleRate: number }): number {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Downsample for performance — work at ~11kHz
  const downsampleFactor = Math.max(1, Math.floor(sampleRate / 11025));
  const downsampled: number[] = [];
  for (let i = 0; i < channelData.length; i += downsampleFactor) {
    downsampled.push(Math.abs(channelData[i]));
  }
  const effectiveRate = sampleRate / downsampleFactor;

  // Compute energy in windows (~23ms windows, ~11ms hop)
  const windowSize = Math.floor(effectiveRate * 0.023);
  const hopSize = Math.floor(windowSize / 2);
  const energies: number[] = [];
  for (let i = 0; i + windowSize < downsampled.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      sum += downsampled[i + j] * downsampled[i + j];
    }
    energies.push(sum / windowSize);
  }

  // Compute onset function (first derivative, half-wave rectified)
  const onsets: number[] = [0];
  for (let i = 1; i < energies.length; i++) {
    onsets.push(Math.max(0, energies[i] - energies[i - 1]));
  }

  // Autocorrelation on the onset function
  // Search BPM range 60-180
  const minBpm = 60;
  const maxBpm = 180;
  const onsetsPerSec = effectiveRate / hopSize;
  const minLag = Math.floor(onsetsPerSec * 60 / maxBpm);
  const maxLag = Math.floor(onsetsPerSec * 60 / minBpm);
  const limit = Math.min(onsets.length, maxLag + 1);

  let bestLag = minLag;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= maxLag && lag < limit; lag++) {
    let corr = 0;
    const n = Math.min(onsets.length - lag, 2000); // limit computation
    for (let i = 0; i < n; i++) {
      corr += onsets[i] * onsets[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const detectedBpm = (onsetsPerSec * 60) / bestLag;

  // Round to nearest integer
  return Math.round(detectedBpm);
}

/**
 * Given a BPM and audio duration, return the beat length in seconds.
 */
export function beatLengthSec(bpm: number): number {
  return 60 / bpm;
}

/**
 * Pick `count` unique random beat indices from the total beats available.
 */
export function pickRandomBeats(totalBeats: number, count: number): number[] {
  const available = Array.from({ length: totalBeats }, (_, i) => i);
  const picked: number[] = [];
  const n = Math.min(count, totalBeats);

  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * available.length);
    picked.push(available[idx]);
    available.splice(idx, 1);
  }

  return picked.sort((a, b) => a - b);
}
