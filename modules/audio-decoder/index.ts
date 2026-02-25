import { requireNativeModule } from 'expo-modules-core';

interface DecodeResult {
  sampleRate: number;
  channels: number;
  frames: number;
  duration: number;
  channelData: string[]; // base64-encoded Float32 arrays per channel
}

let _module: any = null;
function getModule() {
  if (!_module) {
    _module = requireNativeModule('AudioDecoder');
  }
  return _module;
}

export async function decodeNativeAudio(uri: string): Promise<DecodeResult> {
  return getModule().decode(uri);
}

/**
 * Convert base64-encoded Float32 data to Float32Array
 */
export function base64ToFloat32Array(base64: string): Float32Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}
