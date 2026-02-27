import { NativeModule, requireNativeModule } from "expo";
import { type EventSubscription } from "expo-modules-core";

interface StepChangeEvent {
  step: number;
  tripletStep: number;
}

interface AudioEngineModuleEvents {
  onStepChange: (event: StepChangeEvent) => void;
  [key: string]: (...args: any[]) => void;
}

declare class AudioEngineModuleType extends NativeModule<AudioEngineModuleEvents> {
  play(): void;
  stop(): void;
  updateSequencer(bpm: number, stepCount: number, swing: number): void;
  loadSample(
    channelId: number,
    uri: string,
    trimStartMs: number,
    trimEndMs: number,
    playbackRate: number,
    volume: number,
    preservePitch: boolean,
  ): Promise<void>;
  unloadSample(channelId: number): void;
  updatePattern(
    channelId: number,
    steps: boolean[],
    tripletSteps: boolean[],
  ): void;
  setChannelMuted(id: number, muted: boolean): void;
  setChannelSolo(id: number, solo: boolean): void;
  setChannelVolume(id: number, volume: number): void;
  setSampleVolume(id: number, volume: number): void;
  addChannel(channelId: number): void;
  removeChannel(channelId: number): void;
  previewSample(channelId: number): void;
  decode(uri: string): Promise<DecodeResult>;
}

const AudioEngineModule =
  requireNativeModule<AudioEngineModuleType>("AudioEngine");

// Transport
export function play(): void {
  AudioEngineModule.play();
}

export function stop(): void {
  AudioEngineModule.stop();
}

// Sequencer params
export function updateSequencer(
  bpm: number,
  stepCount: number,
  swing: number,
): void {
  AudioEngineModule.updateSequencer(bpm, stepCount, swing);
}

// Sample management
export async function loadSample(
  channelId: number,
  uri: string,
  trimStartMs: number,
  trimEndMs: number,
  playbackRate: number,
  volume: number,
  preservePitch: boolean,
): Promise<void> {
  return AudioEngineModule.loadSample(
    channelId,
    uri,
    trimStartMs,
    trimEndMs,
    playbackRate,
    volume,
    preservePitch,
  );
}

export function unloadSample(channelId: number): void {
  AudioEngineModule.unloadSample(channelId);
}

// Pattern
export function updatePattern(
  channelId: number,
  steps: boolean[],
  tripletSteps: boolean[],
): void {
  AudioEngineModule.updatePattern(channelId, steps, tripletSteps);
}

// Channel state
export function setChannelMuted(id: number, muted: boolean): void {
  AudioEngineModule.setChannelMuted(id, muted);
}

export function setChannelSolo(id: number, solo: boolean): void {
  AudioEngineModule.setChannelSolo(id, solo);
}

export function setChannelVolume(id: number, volume: number): void {
  AudioEngineModule.setChannelVolume(id, volume);
}

export function setSampleVolume(id: number, volume: number): void {
  AudioEngineModule.setSampleVolume(id, volume);
}

// Channel lifecycle
export function addChannel(channelId: number): void {
  AudioEngineModule.addChannel(channelId);
}

export function removeChannel(channelId: number): void {
  AudioEngineModule.removeChannel(channelId);
}

// Preview
export function previewSample(channelId: number): void {
  AudioEngineModule.previewSample(channelId);
}

// Events
export function onStepChange(
  listener: (event: StepChangeEvent) => void,
): EventSubscription {
  return AudioEngineModule.addListener("onStepChange", listener);
}

// Audio decoding
interface DecodeResult {
  sampleRate: number;
  channels: number;
  frames: number;
  duration: number;
  channelData: string[];
}

export async function decodeNativeAudio(uri: string): Promise<DecodeResult> {
  return AudioEngineModule.decode(uri);
}

export function base64ToFloat32Array(base64: string): Float32Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}
