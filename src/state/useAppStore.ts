import { create } from 'zustand';
import { Channel, PunchInEffect, Sample, Scene, SequencerState, getTripletStepCount } from '../types';

const DEFAULT_LABELS = ['Kick', 'Snare', 'Hi-Hat'];
const DEFAULT_STEP_COUNT = 16;
let nextChannelId = 3;

function createDefaultChannels(stepCount: number): Channel[] {
  const tripletCount = getTripletStepCount(stepCount);
  return Array.from({ length: 3 }, (_, i) => ({
    id: i,
    label: DEFAULT_LABELS[i],
    sample: null,
    steps: new Array(stepCount).fill(false),
    stepPitches: new Array(stepCount).fill(0),
    tripletSteps: new Array(tripletCount).fill(false),
    tripletStepPitches: new Array(tripletCount).fill(0),
    muted: false,
    solo: false,
    volume: 0.8,
  }));
}

function createChannel(id: number, stepCount: number, label?: string): Channel {
  const tripletCount = getTripletStepCount(stepCount);
  return {
    id,
    label: label || `Ch ${id + 1}`,
    sample: null,
    steps: new Array(stepCount).fill(false),
    stepPitches: new Array(stepCount).fill(0),
    tripletSteps: new Array(tripletCount).fill(false),
    tripletStepPitches: new Array(tripletCount).fill(0),
    muted: false,
    solo: false,
    volume: 0.8,
  };
}

interface AppStore {
  channels: Channel[];
  beatChannelIds: Set<number>; // channels created by beat presets
  sequencer: SequencerState;
  scenes: Scene[];
  activeSceneId: number | null;
  punchIn: PunchInEffect;
  repeatBeatOrigin: number | null; // step index where repeat started
  pitchEditTarget: { channelId: number; stepIndex: number; isTriplet: boolean } | null;
  selectedScale: string;

  // Pitch edit modal
  openPitchEdit: (channelId: number, stepIndex: number, isTriplet: boolean) => void;
  closePitchEdit: () => void;
  setScale: (scale: string) => void;

  // Punch-in FX
  setPunchIn: (effect: PunchInEffect) => void;

  // Scene management
  saveScene: (name?: string) => void;
  loadScene: (sceneId: number) => void;
  deleteScene: (sceneId: number) => void;
  updateScene: (sceneId: number) => void;

  // Beat preset
  loadBeatChannels: (channels: Channel[], bpm: number, swing: number, stepCount: number) => void;

  // Channel management
  addChannel: (label?: string) => void;
  removeChannel: (channelId: number) => void;
  duplicateChannel: (channelId: number) => void;

  // Channel actions
  loadSample: (channelId: number, sample: Sample) => void;
  removeSample: (channelId: number) => void;
  toggleStep: (channelId: number, stepIndex: number) => void;
  toggleTripletStep: (channelId: number, stepIndex: number) => void;
  setStepPitch: (channelId: number, stepIndex: number, semitones: number) => void;
  setTripletStepPitch: (channelId: number, stepIndex: number, semitones: number) => void;
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
  setSwing: (swing: number) => void;
  setStepCount: (count: number) => void;
  advanceStep: () => void;
  resetStep: () => void;
  setPlaying: (playing: boolean) => void;
  setCurrentStep: (step: number) => void;
  setCurrentTripletStep: (step: number) => void;
}

let nextSceneId = 1;

export const useAppStore = create<AppStore>((set, get) => ({
  channels: createDefaultChannels(DEFAULT_STEP_COUNT),
  beatChannelIds: new Set<number>(),
  sequencer: {
    bpm: 120,
    stepCount: DEFAULT_STEP_COUNT,
    currentStep: 0,
    currentTripletStep: 0,
    isPlaying: false,
    swing: 0,
  },
  scenes: [],
  activeSceneId: null,
  punchIn: null,
  repeatBeatOrigin: null,
  pitchEditTarget: null,
  selectedScale: 'Chromatic',

  openPitchEdit: (channelId, stepIndex, isTriplet) =>
    set({ pitchEditTarget: { channelId, stepIndex, isTriplet } }),

  closePitchEdit: () =>
    set({ pitchEditTarget: null }),

  setScale: (scale) =>
    set({ selectedScale: scale }),

  setPunchIn: (effect) =>
    set((state) => ({
      punchIn: effect,
      // When activating repeat, snapshot the current beat origin (quantize to beat = 4 steps)
      repeatBeatOrigin: effect === 'repeat'
        ? Math.floor(state.sequencer.currentStep / 4) * 4
        : null,
    })),

  saveScene: (name) =>
    set((state) => {
      if (state.scenes.length >= 4) return state;
      const id = nextSceneId++;
      const channelSteps: Record<number, boolean[]> = {};
      const channelStepPitches: Record<number, number[]> = {};
      const channelTripletSteps: Record<number, boolean[]> = {};
      const channelTripletStepPitches: Record<number, number[]> = {};
      state.channels.forEach((ch) => {
        channelSteps[ch.id] = [...ch.steps];
        channelStepPitches[ch.id] = [...ch.stepPitches];
        channelTripletSteps[ch.id] = [...ch.tripletSteps];
        channelTripletStepPitches[ch.id] = [...ch.tripletStepPitches];
      });
      const scene: Scene = {
        id,
        name: name || `Scene ${id}`,
        channelSteps,
        channelStepPitches,
        channelTripletSteps,
        channelTripletStepPitches,
        bpm: state.sequencer.bpm,
        stepCount: state.sequencer.stepCount,
        swing: state.sequencer.swing,
      };
      return { scenes: [...state.scenes, scene], activeSceneId: id };
    }),

  loadScene: (sceneId) =>
    set((state) => {
      const scene = state.scenes.find((s) => s.id === sceneId);
      if (!scene) return state;

      // Auto-save the current scene before switching
      let scenes = state.scenes;
      if (state.activeSceneId !== null) {
        const channelSteps: Record<number, boolean[]> = {};
        const channelStepPitches: Record<number, number[]> = {};
        const channelTripletSteps: Record<number, boolean[]> = {};
        const channelTripletStepPitches: Record<number, number[]> = {};
        state.channels.forEach((ch) => {
          channelSteps[ch.id] = [...ch.steps];
          channelStepPitches[ch.id] = [...ch.stepPitches];
          channelTripletSteps[ch.id] = [...ch.tripletSteps];
          channelTripletStepPitches[ch.id] = [...ch.tripletStepPitches];
        });
        scenes = scenes.map((s) =>
          s.id === state.activeSceneId
            ? {
                ...s,
                channelSteps,
                channelStepPitches,
                channelTripletSteps,
                channelTripletStepPitches,
                bpm: state.sequencer.bpm,
                stepCount: state.sequencer.stepCount,
                swing: state.sequencer.swing,
              }
            : s
        );
      }

      const tripletCount = getTripletStepCount(scene.stepCount);
      const newChannels = state.channels.map((ch) => {
        const savedSteps = scene.channelSteps[ch.id];
        const savedStepPitches = scene.channelStepPitches?.[ch.id];
        const savedTripletSteps = scene.channelTripletSteps?.[ch.id];
        const savedTripletStepPitches = scene.channelTripletStepPitches?.[ch.id];
        const steps = new Array(scene.stepCount).fill(false);
        const stepPitches = new Array(scene.stepCount).fill(0);
        const tripletSteps = new Array(tripletCount).fill(false);
        const tripletStepPitches = new Array(tripletCount).fill(0);
        if (savedSteps) {
          savedSteps.forEach((s, i) => { if (i < scene.stepCount) steps[i] = s; });
        }
        if (savedStepPitches) {
          savedStepPitches.forEach((p, i) => { if (i < scene.stepCount) stepPitches[i] = p; });
        }
        if (savedTripletSteps) {
          savedTripletSteps.forEach((s, i) => { if (i < tripletCount) tripletSteps[i] = s; });
        }
        if (savedTripletStepPitches) {
          savedTripletStepPitches.forEach((p, i) => { if (i < tripletCount) tripletStepPitches[i] = p; });
        }
        return { ...ch, steps, stepPitches, tripletSteps, tripletStepPitches };
      });
      return {
        scenes,
        channels: newChannels,
        sequencer: {
          ...state.sequencer,
          bpm: scene.bpm,
          stepCount: scene.stepCount,
          swing: scene.swing,
          currentStep: 0,
        },
        activeSceneId: sceneId,
      };
    }),

  deleteScene: (sceneId) =>
    set((state) => ({
      scenes: state.scenes.filter((s) => s.id !== sceneId),
      activeSceneId: state.activeSceneId === sceneId ? null : state.activeSceneId,
    })),

  updateScene: (sceneId) =>
    set((state) => {
      const channelSteps: Record<number, boolean[]> = {};
      const channelStepPitches: Record<number, number[]> = {};
      const channelTripletSteps: Record<number, boolean[]> = {};
      const channelTripletStepPitches: Record<number, number[]> = {};
      state.channels.forEach((ch) => {
        channelSteps[ch.id] = [...ch.steps];
        channelStepPitches[ch.id] = [...ch.stepPitches];
        channelTripletSteps[ch.id] = [...ch.tripletSteps];
        channelTripletStepPitches[ch.id] = [...ch.tripletStepPitches];
      });
      return {
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                channelSteps,
                channelStepPitches,
                channelTripletSteps,
                channelTripletStepPitches,
                bpm: state.sequencer.bpm,
                stepCount: state.sequencer.stepCount,
                swing: state.sequencer.swing,
              }
            : s
        ),
      };
    }),

  loadBeatChannels: (beatChannels, bpm, swing, stepCount) =>
    set((state) => {
      const tripletCount = getTripletStepCount(stepCount);
      const newBeatIds = new Set(beatChannels.map((ch) => ch.id));

      // Keep user channels (non-beat), resize their steps to match new stepCount
      // On first load (no prior beat), also discard empty default channels (no sample, no active steps)
      const isFirstLoad = state.beatChannelIds.size === 0;
      const userChannels = state.channels
        .filter((ch) => !state.beatChannelIds.has(ch.id))
        .filter((ch) => !isFirstLoad || ch.sample !== null || ch.steps.some(Boolean))
        .map((ch) => {
          const newSteps = new Array(stepCount).fill(false);
          ch.steps.forEach((s, i) => { if (i < stepCount) newSteps[i] = s; });
          const newStepPitches = new Array(stepCount).fill(0);
          ch.stepPitches.forEach((p, i) => { if (i < stepCount) newStepPitches[i] = p; });
          const newTripletSteps = new Array(tripletCount).fill(false);
          ch.tripletSteps.forEach((s, i) => { if (i < tripletCount) newTripletSteps[i] = s; });
          const newTripletStepPitches = new Array(tripletCount).fill(0);
          ch.tripletStepPitches.forEach((p, i) => { if (i < tripletCount) newTripletStepPitches[i] = p; });
          return { ...ch, steps: newSteps, stepPitches: newStepPitches, tripletSteps: newTripletSteps, tripletStepPitches: newTripletStepPitches };
        });

      // Beat channels first, then user channels
      const allChannels = [...beatChannels, ...userChannels];

      // Update nextChannelId to be above the highest id
      const maxId = allChannels.reduce((max, ch) => Math.max(max, ch.id), nextChannelId - 1);
      nextChannelId = maxId + 1;

      return {
        channels: allChannels,
        beatChannelIds: newBeatIds,
        sequencer: {
          ...state.sequencer,
          bpm: Math.max(40, Math.min(240, bpm)),
          swing: Math.max(0, Math.min(100, swing)),
          stepCount,
          currentStep: 0,
          currentTripletStep: 0,
        },
        activeSceneId: null,
      };
    }),

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

  duplicateChannel: (channelId) =>
    set((state) => {
      const source = state.channels.find((ch) => ch.id === channelId);
      if (!source) return state;
      const newId = nextChannelId++;
      const dupe: Channel = {
        ...source,
        id: newId,
        label: `${source.label} copy`,
        steps: [...source.steps],
        stepPitches: [...source.stepPitches],
        tripletSteps: [...source.tripletSteps],
        tripletStepPitches: [...source.tripletStepPitches],
        sample: source.sample ? { ...source.sample, id: `sample_${Date.now()}` } : null,
      };
      const idx = state.channels.findIndex((ch) => ch.id === channelId);
      const newChannels = [...state.channels];
      newChannels.splice(idx + 1, 0, dupe);
      return { channels: newChannels };
    }),

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

  toggleTripletStep: (channelId, stepIndex) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              tripletSteps: ch.tripletSteps.map((s, i) => (i === stepIndex ? !s : s)),
            }
          : ch
      ),
    })),

  setStepPitch: (channelId, stepIndex, semitones) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              stepPitches: ch.stepPitches.map((p, i) => (i === stepIndex ? semitones : p)),
            }
          : ch
      ),
    })),

  setTripletStepPitch: (channelId, stepIndex, semitones) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              tripletStepPitches: ch.tripletStepPitches.map((p, i) => (i === stepIndex ? semitones : p)),
            }
          : ch
      ),
    })),

  clearSteps: (channelId) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? {
              ...ch,
              steps: new Array(state.sequencer.stepCount).fill(false),
              stepPitches: new Array(state.sequencer.stepCount).fill(0),
              tripletSteps: new Array(getTripletStepCount(state.sequencer.stepCount)).fill(false),
              tripletStepPitches: new Array(getTripletStepCount(state.sequencer.stepCount)).fill(0),
            }
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

  setSwing: (swing) =>
    set((state) => ({
      sequencer: { ...state.sequencer, swing: Math.max(0, Math.min(100, swing)) },
    })),

  setStepCount: (count) =>
    set((state) => {
      const tripletCount = getTripletStepCount(count);
      const newChannels = state.channels.map((ch) => {
        const newSteps = new Array(count).fill(false);
        ch.steps.forEach((s, i) => {
          if (i < count) newSteps[i] = s;
        });
        const newStepPitches = new Array(count).fill(0);
        ch.stepPitches.forEach((p, i) => {
          if (i < count) newStepPitches[i] = p;
        });
        const newTripletSteps = new Array(tripletCount).fill(false);
        ch.tripletSteps.forEach((s, i) => {
          if (i < tripletCount) newTripletSteps[i] = s;
        });
        const newTripletStepPitches = new Array(tripletCount).fill(0);
        ch.tripletStepPitches.forEach((p, i) => {
          if (i < tripletCount) newTripletStepPitches[i] = p;
        });
        return { ...ch, steps: newSteps, stepPitches: newStepPitches, tripletSteps: newTripletSteps, tripletStepPitches: newTripletStepPitches };
      });
      return {
        channels: newChannels,
        sequencer: { ...state.sequencer, stepCount: count, currentStep: 0, currentTripletStep: 0 },
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

  setCurrentTripletStep: (step) =>
    set((state) => ({
      sequencer: { ...state.sequencer, currentTripletStep: step },
    })),
}));
