import { create } from 'zustand';
import { Channel, Sample, SequencerState } from '../types';

const DEFAULT_LABELS = ['Kick', 'Snare', 'Hi-Hat', 'Perc'];
const DEFAULT_STEP_COUNT = 16;
let nextChannelId = 4;

function createDefaultChannels(stepCount: number): Channel[] {
  return Array.from({ length: 4 }, (_, i) => ({
    id: i,
    label: DEFAULT_LABELS[i],
    sample: null,
    steps: new Array(stepCount).fill(false),
    muted: false,
    solo: false,
    volume: 0.8,
  }));
}

function createChannel(id: number, stepCount: number, label?: string): Channel {
  return {
    id,
    label: label || `Ch ${id + 1}`,
    sample: null,
    steps: new Array(stepCount).fill(false),
    muted: false,
    solo: false,
    volume: 0.8,
  };
}

interface AppStore {
  channels: Channel[];
  sequencer: SequencerState;

  // Channel management
  addChannel: (label?: string) => void;
  removeChannel: (channelId: number) => void;

  // Channel actions
  loadSample: (channelId: number, sample: Sample) => void;
  removeSample: (channelId: number) => void;
  toggleStep: (channelId: number, stepIndex: number) => void;
  clearSteps: (channelId: number) => void;
  setChannelVolume: (channelId: number, volume: number) => void;
  toggleMute: (channelId: number) => void;
  toggleSolo: (channelId: number) => void;
  setChannelLabel: (channelId: number, label: string) => void;

  // Sample edit actions
  updateSampleTrim: (channelId: number, startMs: number, endMs: number) => void;
  updateSampleRate: (channelId: number, rate: number) => void;
  updateSamplePreservePitch: (channelId: number, preserve: boolean) => void;
  updateSampleVolume: (channelId: number, volume: number) => void;

  // Sequencer actions
  setBpm: (bpm: number) => void;
  setStepCount: (count: number) => void;
  advanceStep: () => void;
  resetStep: () => void;
  setPlaying: (playing: boolean) => void;
  setCurrentStep: (step: number) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  channels: createDefaultChannels(DEFAULT_STEP_COUNT),
  sequencer: {
    bpm: 120,
    stepCount: DEFAULT_STEP_COUNT,
    currentStep: 0,
    isPlaying: false,
  },

  addChannel: (label) =>
    set((state) => {
      const id = nextChannelId++;
      const newChannel = createChannel(id, state.sequencer.stepCount, label);
      return { channels: [...state.channels, newChannel] };
    }),

  removeChannel: (channelId) =>
    set((state) => ({
      channels: state.channels.filter((ch) => ch.id !== channelId),
    })),

  loadSample: (channelId, sample) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, sample } : ch
      ),
    })),

  removeSample: (channelId) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, sample: null } : ch
      ),
    })),

  toggleStep: (channelId, stepIndex) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              steps: ch.steps.map((s, i) => (i === stepIndex ? !s : s)),
            }
          : ch
      ),
    })),

  clearSteps: (channelId) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, steps: new Array(state.sequencer.stepCount).fill(false) }
          : ch
      ),
    })),

  setChannelVolume: (channelId, volume) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, volume } : ch
      ),
    })),

  toggleMute: (channelId) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, muted: !ch.muted } : ch
      ),
    })),

  toggleSolo: (channelId) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, solo: !ch.solo } : ch
      ),
    })),

  setChannelLabel: (channelId, label) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, label } : ch
      ),
    })),

  updateSampleTrim: (channelId, startMs, endMs) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId && ch.sample
          ? { ...ch, sample: { ...ch.sample, trimStartMs: startMs, trimEndMs: endMs } }
          : ch
      ),
    })),

  updateSampleRate: (channelId, rate) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId && ch.sample
          ? { ...ch, sample: { ...ch.sample, playbackRate: rate } }
          : ch
      ),
    })),

  updateSamplePreservePitch: (channelId, preserve) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId && ch.sample
          ? { ...ch, sample: { ...ch.sample, preservePitch: preserve } }
          : ch
      ),
    })),

  updateSampleVolume: (channelId, volume) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId && ch.sample
          ? { ...ch, sample: { ...ch.sample, volume } }
          : ch
      ),
    })),

  setBpm: (bpm) =>
    set((state) => ({
      sequencer: { ...state.sequencer, bpm: Math.max(40, Math.min(240, bpm)) },
    })),

  setStepCount: (count) =>
    set((state) => {
      const newChannels = state.channels.map((ch) => {
        const newSteps = new Array(count).fill(false);
        // Preserve existing step pattern
        ch.steps.forEach((s, i) => {
          if (i < count) newSteps[i] = s;
        });
        return { ...ch, steps: newSteps };
      });
      return {
        channels: newChannels,
        sequencer: { ...state.sequencer, stepCount: count, currentStep: 0 },
      };
    }),

  advanceStep: () =>
    set((state) => ({
      sequencer: {
        ...state.sequencer,
        currentStep: (state.sequencer.currentStep + 1) % state.sequencer.stepCount,
      },
    })),

  resetStep: () =>
    set((state) => ({
      sequencer: { ...state.sequencer, currentStep: 0 },
    })),

  setPlaying: (playing) =>
    set((state) => ({
      sequencer: {
        ...state.sequencer,
        isPlaying: playing,
        currentStep: playing ? state.sequencer.currentStep : 0,
      },
    })),

  setCurrentStep: (step) =>
    set((state) => ({
      sequencer: { ...state.sequencer, currentStep: step },
    })),
}));
