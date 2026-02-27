/**
 * Cross-platform audio decoding.
 * Web: uses AudioContext.decodeAudioData
 * Native iOS: uses AVFoundation via local Expo module (supports WAV, MP3, AAC, ALAC, etc.)
 */
import { Platform } from 'react-native';

/** Minimal AudioBuffer-compatible interface used by ChopScreen */
export interface DecodedAudio {
  sampleRate: number;
  duration: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/** Decode audio from a URI (blob URL on web, file URI on native) */
export async function decodeAudioFile(uri: string): Promise<DecodedAudio> {
  if (Platform.OS === 'web') {
    return decodeWeb(uri);
  }
  return decodeNativeModule(uri);
}

async function decodeWeb(uri: string): Promise<DecodedAudio> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  return decoded;
}

async function decodeNativeModule(uri: string): Promise<DecodedAudio> {
  const { decodeNativeAudio, base64ToFloat32Array } = await import('../../modules/audio-engine');
  const result = await decodeNativeAudio(uri);

  const channels: Float32Array[] = result.channelData.map(base64ToFloat32Array);

  return {
    sampleRate: result.sampleRate,
    duration: result.duration,
    length: result.frames,
    numberOfChannels: result.channels,
    getChannelData(channel: number): Float32Array {
      return channels[channel];
    },
  };
}

/**
 * Encode a slice of a DecodedAudio as a WAV.
 * Returns a Blob on web, or writes to a file on native and returns the URI.
 */
export async function encodeChopToUri(
  audio: DecodedAudio,
  startSample: number,
  endSample: number,
): Promise<string> {
  const numChannels = audio.numberOfChannels;
  const sampleRate = audio.sampleRate;
  const numSamples = endSample - startSample;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, headerSize - 8 + dataSize, true);
  writeStr(view, 8, 'WAVE');

  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audio.getChannelData(c));
  }

  let offset = headerSize;
  for (let i = startSample; i < endSample; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  if (Platform.OS === 'web') {
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  // Native: write to file
  const { Paths, Directory, File } = await import('expo-file-system');
  const chopDir = new Directory(Paths.document, 'chops');
  if (!chopDir.exists) {
    chopDir.create();
  }
  const file = new File(chopDir, `chop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`);
  file.create();
  file.write(new Uint8Array(buffer));
  return file.uri;
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
