import { requireNativeModule } from 'expo-modules-core';
import { EventEmitter, type EventSubscription } from 'expo-modules-core';

interface StepChangeEvent {
  step: number;
  tripletStep: number;
}

interface AudioEngineEvents {
  onStepChange: (event: StepChangeEvent) => void;
}

let _module: any = null;
function getModule() {
  if (!_module) {
    _module = requireNativeModule('AudioEngine');
  }
  return _module;
}

let _emitter: InstanceType<typeof EventEmitter> | null = null;
function getEmitter() {
  if (!_emitter) {
    _emitter = new EventEmitter(getModule());
  }
  return _emitter;
}

// Transport
export function play(): void {
  getModule().play();
}

export function stop(): void {
  getModule().stop();
}

// Sequencer params
export function updateSequencer(bpm: number, stepCount: number, swing: number): void {
  getModule().updateSequencer(bpm, stepCount, swing);
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
  return getModule().loadSample(channelId, uri, trimStartMs, trimEndMs, playbackRate, volume, preservePitch);
}

export function unloadSample(channelId: number): void {
  getModule().unloadSample(channelId);
}

// Pattern
export function updatePattern(channelId: number, steps: boolean[], tripletSteps: boolean[]): void {
  getModule().updatePattern(channelId, steps, tripletSteps);
}

// Channel state
export function setChannelMuted(id: number, muted: boolean): void {
  getModule().setChannelMuted(id, muted);
}

export function setChannelSolo(id: number, solo: boolean): void {
  getModule().setChannelSolo(id, solo);
}

export function setChannelVolume(id: number, volume: number): void {
  getModule().setChannelVolume(id, volume);
}

export function setSampleVolume(id: number, volume: number): void {
  getModule().setSampleVolume(id, volume);
}

// Channel lifecycle
export function addChannel(channelId: number): void {
  getModule().addChannel(channelId);
}

export function removeChannel(channelId: number): void {
  getModule().removeChannel(channelId);
}

// Preview
export function previewSample(channelId: number): void {
  getModule().previewSample(channelId);
}

// Events
export function onStepChange(listener: (event: StepChangeEvent) => void): EventSubscription {
  return getEmitter().addListener('onStepChange', listener);
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
  return getModule().decode(uri);
}

export function base64ToFloat32Array(base64: string): Float32Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}
