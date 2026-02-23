/**
 * Platform bridge: generates a synth WAV and returns a standard Sample object.
 * Web: blob URL. Native: writes to Paths.document/samples/.
 */
import { Platform } from 'react-native';
import { OscillatorParams, synthesize } from './oscillator';
import { Sample } from '../types';

export async function createSynthSample(
  params: OscillatorParams,
  name: string,
): Promise<Sample> {
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
    // Write the ArrayBuffer as base64
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
