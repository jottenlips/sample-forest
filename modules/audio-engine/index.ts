import { Platform } from 'react-native';
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
let ExpoEventEmitter: any = null;
if (isIOS) {
  try {
    const core = require('expo-modules-core');
    NativeAudioEngine = core.requireNativeModule('AudioEngine');
    ExpoEventEmitter = core.EventEmitter;
  } catch (e) {
    console.warn('AudioEngine native module not available — using JS fallback');
  }
}

export const isNativeAvailable = NativeAudioEngine !== null;

// Event emitter using expo-modules-core EventEmitter
let emitter: any = null;
function getEmitter(): any {
  if (!isNativeAvailable || !ExpoEventEmitter) return null;
  if (!emitter) {
    emitter = new ExpoEventEmitter(NativeAudioEngine);
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
