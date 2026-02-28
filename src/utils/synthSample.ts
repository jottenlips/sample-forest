/**
 * Platform bridge: generates a synth WAV and returns a standard Sample object.
 * Web: JS oscillator → blob URL. iOS native: AVAudioEngine synth → file URI.
 */
import { Platform } from 'react-native';
import { OscillatorParams, MultiOscillatorParams, synthesize, synthesizeMulti } from './oscillator';
import { Sample } from '../types';
import { isNativeAvailable } from '../../modules/audio-engine';

export async function createMultiSynthSample(
  params: MultiOscillatorParams,
  name: string,
): Promise<Sample> {
  // iOS: use native synth engine
  if (isNativeAvailable) {
    const AudioEngine = require('../../modules/audio-engine');
    const result = await AudioEngine.synthesize({
      layers: params.layers.map((l) => ({
        waveform: l.waveform,
        frequency: l.frequency,
        volume: l.volume,
      })),
      noise: params.noise,
      durationMs: params.durationMs,
      attackMs: params.attackMs,
      decayMs: params.decayMs,
      volume: params.volume,
      lfo: params.lfo
        ? {
            rate: params.lfo.rate,
            depth: params.lfo.depth,
            waveform: params.lfo.waveform,
            target: params.lfo.target,
          }
        : null,
    });

    return {
      id: `synth_${Date.now()}`,
      uri: result.uri,
      name,
      durationMs: result.durationMs,
      trimStartMs: 0,
      trimEndMs: result.durationMs,
      playbackRate: 1.0,
      preservePitch: true,
      volume: params.volume,
      waveformData: result.waveformData,
    };
  }

  // Web/Android: JS oscillator
  const { wavBuffer, durationMs, waveformData } = synthesizeMulti(params);

  let uri: string;

  if (Platform.OS === 'web') {
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    uri = URL.createObjectURL(blob);
  } else {
    const { Paths, Directory, File } = await import('expo-file-system');
    const samplesDir = new Directory(Paths.document, 'samples');
    if (!samplesDir.exists) {
      samplesDir.create();
    }
    const fileName = `synth_${Date.now()}.wav`;
    const destFile = new File(samplesDir, fileName);
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    destFile.create();
    destFile.write(base64, { encoding: 'base64' });
    uri = destFile.uri;
  }

  return {
    id: `synth_${Date.now()}`,
    uri,
    name,
    durationMs,
    trimStartMs: 0,
    trimEndMs: durationMs,
    playbackRate: 1.0,
    preservePitch: true,
    volume: params.volume,
    waveformData,
  };
}

export async function createSynthSample(
  params: OscillatorParams,
  name: string,
): Promise<Sample> {
  // iOS: use native synth engine (wrap single osc as multi-layer)
  if (isNativeAvailable) {
    const AudioEngine = require('../../modules/audio-engine');
    const result = await AudioEngine.synthesize({
      layers: [
        {
          waveform: params.waveform,
          frequency: params.frequency,
          volume: 1.0,
        },
      ],
      noise: 0,
      durationMs: params.durationMs,
      attackMs: params.attackMs,
      decayMs: params.decayMs,
      volume: params.volume,
      lfo: null,
    });

    return {
      id: `synth_${Date.now()}`,
      uri: result.uri,
      name,
      durationMs: result.durationMs,
      trimStartMs: 0,
      trimEndMs: result.durationMs,
      playbackRate: 1.0,
      preservePitch: true,
      volume: params.volume,
      waveformData: result.waveformData,
    };
  }

  // Web/Android: JS oscillator
  const { wavBuffer, durationMs, waveformData } = synthesize(params);

  let uri: string;

  if (Platform.OS === 'web') {
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    uri = URL.createObjectURL(blob);
  } else {
    const { Paths, Directory, File } = await import('expo-file-system');
    const samplesDir = new Directory(Paths.document, 'samples');
    if (!samplesDir.exists) {
      samplesDir.create();
    }
    const fileName = `synth_${Date.now()}.wav`;
    const destFile = new File(samplesDir, fileName);
    const bytes = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    destFile.create();
    destFile.write(base64, { encoding: 'base64' });
    uri = destFile.uri;
  }

  return {
    id: `synth_${Date.now()}`,
    uri,
    name,
    durationMs,
    trimStartMs: 0,
    trimEndMs: durationMs,
    playbackRate: 1.0,
    preservePitch: true,
    volume: params.volume,
    waveformData,
  };
}
