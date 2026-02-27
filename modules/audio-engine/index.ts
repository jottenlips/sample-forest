import { Platform, NativeEventEmitter, NativeModules } from 'react-native';
import type {
  SequencerConfig,
  SynthParams,
  SynthResult,
  ImportResult,
  StepChangeEvent,
} from './src/AudioEngineModule.types';

export type {
  SequencerConfig,
  ChannelConfig,
  SynthParams,
  SynthLayerParams,
  LfoParams,
  SynthResult,
  ImportResult,
  StepChangeEvent,
} from './src/AudioEngineModule.types';

const isIOS = Platform.OS === 'ios';

// Safely require native module — returns null if not compiled in yet
let NativeAudioEngine: any = null;
if (isIOS) {
  try {
    NativeAudioEngine = require('expo-modules-core').requireNativeModule('AudioEngine');
  } catch (e) {
    console.warn('AudioEngine native module not available — using JS fallback');
  }
}

export const isNativeAvailable = NativeAudioEngine !== null;

// Event emitter for onStepChange
let emitter: NativeEventEmitter | null = null;
function getEmitter(): NativeEventEmitter | null {
  if (!isNativeAvailable) return null;
  if (!emitter) {
    emitter = new NativeEventEmitter(NativeAudioEngine);
  }
  return emitter;
}

export async function loadSample(sampleId: string, uri: string): Promise<void> {
  if (!isNativeAvailable) return;
  return NativeAudioEngine.loadSample(sampleId, uri);
}

export async function unloadSample(sampleId: string): Promise<void> {
  if (!isNativeAvailable) return;
  return NativeAudioEngine.unloadSample(sampleId);
}

export async function startSequencer(config: SequencerConfig): Promise<void> {
  if (!isNativeAvailable) return;
  return NativeAudioEngine.startSequencer(config);
}

export async function stopSequencer(): Promise<void> {
  if (!isNativeAvailable) return;
  return NativeAudioEngine.stopSequencer();
}

export async function updateSequencerConfig(config: SequencerConfig): Promise<void> {
  if (!isNativeAvailable) return;
  return NativeAudioEngine.updateSequencerConfig(config);
}

export async function triggerSample(sampleId: string): Promise<void> {
  if (!isNativeAvailable) return;
  return NativeAudioEngine.triggerSample(sampleId);
}

export async function synthesize(params: SynthParams): Promise<SynthResult> {
  if (!isNativeAvailable) return { uri: '', durationMs: 0, waveformData: [] };
  return NativeAudioEngine.synthesize(params);
}

export async function importAudioFile(
  sourceUri: string,
  fileName: string,
): Promise<ImportResult> {
  if (!isNativeAvailable) return { uri: '', durationMs: 0, waveformData: [] };
  return NativeAudioEngine.importAudioFile(sourceUri, fileName);
}

export function addStepChangeListener(
  callback: (event: StepChangeEvent) => void,
): { remove: () => void } {
  if (!isNativeAvailable) return { remove: () => {} };
  const em = getEmitter();
  if (!em) return { remove: () => {} };
  const subscription = em.addListener('onStepChange', callback);
  return { remove: () => subscription.remove() };
}
