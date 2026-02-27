import { useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useAppStore } from '../state/useAppStore';
import { getTripletStepCount } from '../types';
import { isNativeAvailable } from '../../modules/audio-engine';

type TriggerCallback = (channelId: number) => void;

// ──────────────────────────────────────────────────
// iOS: Native AVAudioEngine sequencer via Expo Module
// ──────────────────────────────────────────────────
function useSequencerIOS() {
  const { sequencer, channels, setCurrentStep, setPlaying } = useAppStore();
  const setCurrentTripletStep = useAppStore((s) => s.setCurrentTripletStep);
  const punchIn = useAppStore((s) => s.punchIn);
  const repeatBeatOrigin = useAppStore((s) => s.repeatBeatOrigin);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const isStartedRef = useRef(false);

  // Build native config from current state
  const buildConfig = useCallback(() => {
    const AudioEngine = require('../../modules/audio-engine');
    const state = useAppStore.getState();
    return {
      bpm: state.sequencer.bpm,
      stepCount: state.sequencer.stepCount,
      swing: state.sequencer.swing,
      punchIn: state.punchIn ?? null,
      repeatBeatOrigin: state.repeatBeatOrigin ?? null,
      channels: state.channels.map((ch) => ({
        channelId: ch.id,
        sampleId: ch.sample?.id ?? '',
        volume: ch.sample ? ch.sample.volume * ch.volume : ch.volume,
        muted: ch.muted,
        solo: ch.solo,
        steps: ch.steps,
        tripletSteps: ch.tripletSteps,
        trimStartMs: ch.sample?.trimStartMs ?? 0,
        trimEndMs: ch.sample?.trimEndMs ?? 0,
        playbackRate: ch.sample?.playbackRate ?? 1.0,
      })),
    };
  }, []);

  const start = useCallback(() => {
    const AudioEngine = require('../../modules/audio-engine');
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    setPlaying(true);

    // Listen for step changes from native
    if (!listenerRef.current) {
      listenerRef.current = AudioEngine.addStepChangeListener(
        (event: { currentStep: number; currentTripletStep: number }) => {
          setCurrentStep(event.currentStep);
          setCurrentTripletStep(event.currentTripletStep);
        },
      );
    }

    const config = buildConfig();
    AudioEngine.startSequencer(config);
  }, [buildConfig, setPlaying, setCurrentStep, setCurrentTripletStep]);

  const stop = useCallback(() => {
    const AudioEngine = require('../../modules/audio-engine');
    isStartedRef.current = false;
    AudioEngine.stopSequencer();
    setPlaying(false);
    setCurrentStep(0);
    setCurrentTripletStep(0);
  }, [setPlaying, setCurrentStep, setCurrentTripletStep]);

  // Hot-update config when relevant state changes during playback
  useEffect(() => {
    if (!isStartedRef.current) return;
    const AudioEngine = require('../../modules/audio-engine');
    const config = buildConfig();
    AudioEngine.updateSequencerConfig(config);
  }, [
    sequencer.bpm,
    sequencer.swing,
    sequencer.stepCount,
    channels,
    punchIn,
    repeatBeatOrigin,
    buildConfig,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }
      if (isStartedRef.current) {
        const AudioEngine = require('../../modules/audio-engine');
        AudioEngine.stopSequencer();
        isStartedRef.current = false;
      }
    };
  }, []);

  return { start, stop, isPlaying: sequencer.isPlaying };
}

// ──────────────────────────────────────────────────
// Web/Android: existing JS setInterval implementation
// ──────────────────────────────────────────────────
function useSequencerJS(triggerCallbacks: Map<number, TriggerCallback>) {
  const { sequencer, channels, advanceStep, setCurrentStep, setPlaying } = useAppStore();
  const setCurrentTripletStep = useAppStore((s) => s.setCurrentTripletStep);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextStepTimeRef = useRef<number>(0);
  const currentStepRef = useRef<number>(0);
  const nextTripletTimeRef = useRef<number>(0);
  const currentTripletStepRef = useRef<number>(0);

  const LOOKAHEAD_MS = 100;
  const TICK_MS = 25;

  const getStepDurationMs = useCallback(() => {
    return (60000 / sequencer.bpm) / 4;
  }, [sequencer.bpm]);

  const getTripletStepDurationMs = useCallback(() => {
    return ((60000 / sequencer.bpm) / 4) * (2 / 3);
  }, [sequencer.bpm]);

  const scheduleStep = useCallback(
    (stepIndex: number, delay: number) => {
      const state = useAppStore.getState();
      const hasSolo = state.channels.some((ch) => ch.solo);
      const punchIn = state.punchIn;

      let swapMap: Map<number, number> | null = null;
      if (punchIn === 'swap' && state.channels.length > 1) {
        const channelIds = state.channels.map((c) => c.id);
        swapMap = new Map();
        for (let i = 0; i < channelIds.length; i++) {
          const sourceIdx = (i + 1) % channelIds.length;
          swapMap.set(channelIds[i], channelIds[sourceIdx]);
        }
      }

      setTimeout(() => {
        setCurrentStep(stepIndex);

        state.channels.forEach((channel) => {
          if (!channel.steps[stepIndex]) return;
          if (channel.muted) return;
          if (hasSolo && !channel.solo) return;

          if (punchIn === 'swap' && swapMap) {
            const swappedId = swapMap.get(channel.id);
            if (swappedId !== undefined) {
              const swappedChannel = state.channels.find((c) => c.id === swappedId);
              if (swappedChannel?.sample) {
                const callback = triggerCallbacks.get(swappedId);
                if (callback) callback(swappedId);
              }
            }
          } else {
            if (!channel.sample) return;
            const callback = triggerCallbacks.get(channel.id);
            if (callback) callback(channel.id);
          }
        });
      }, Math.max(0, delay));
    },
    [triggerCallbacks, setCurrentStep],
  );

  const scheduleTripletStep = useCallback(
    (stepIndex: number, delay: number) => {
      const state = useAppStore.getState();
      const hasSolo = state.channels.some((ch) => ch.solo);
      const punchIn = state.punchIn;

      let swapMap: Map<number, number> | null = null;
      if (punchIn === 'swap' && state.channels.length > 1) {
        const channelIds = state.channels.map((c) => c.id);
        swapMap = new Map();
        for (let i = 0; i < channelIds.length; i++) {
          const sourceIdx = (i + 1) % channelIds.length;
          swapMap.set(channelIds[i], channelIds[sourceIdx]);
        }
      }

      setTimeout(() => {
        setCurrentTripletStep(stepIndex);

        state.channels.forEach((channel) => {
          if (!channel.tripletSteps[stepIndex]) return;
          if (channel.muted) return;
          if (hasSolo && !channel.solo) return;

          if (punchIn === 'swap' && swapMap) {
            const swappedId = swapMap.get(channel.id);
            if (swappedId !== undefined) {
              const swappedChannel = state.channels.find((c) => c.id === swappedId);
              if (swappedChannel?.sample) {
                const callback = triggerCallbacks.get(swappedId);
                if (callback) callback(swappedId);
              }
            }
          } else {
            if (!channel.sample) return;
            const callback = triggerCallbacks.get(channel.id);
            if (callback) callback(channel.id);
          }
        });
      }, Math.max(0, delay));
    },
    [triggerCallbacks, setCurrentTripletStep],
  );

  const schedulerTick = useCallback(() => {
    const now = Date.now();
    const baseStepDuration = getStepDurationMs();
    const baseTripletDuration = getTripletStepDurationMs();
    const state = useAppStore.getState();
    const punchIn = state.punchIn;
    const tripletCount = getTripletStepCount(state.sequencer.stepCount);

    let stepDuration = baseStepDuration;
    let tripletDuration = baseTripletDuration;
    if (punchIn === 'double') {
      stepDuration = baseStepDuration / 2;
      tripletDuration = baseTripletDuration / 2;
    } else if (punchIn === 'half') {
      stepDuration = baseStepDuration * 2;
      tripletDuration = baseTripletDuration * 2;
    }

    const swingAmount = (state.sequencer.swing / 100) * 0.75;

    while (nextStepTimeRef.current < now + LOOKAHEAD_MS) {
      let step = currentStepRef.current;

      if (punchIn === 'repeat' && state.repeatBeatOrigin !== null) {
        const beatOrigin = state.repeatBeatOrigin;
        const beatLength = 4;
        step = beatOrigin + ((step - beatOrigin) % beatLength + beatLength) % beatLength;
      }

      const isOffbeat = step % 2 === 1;
      const swingDelayMs = isOffbeat ? swingAmount * stepDuration : 0;
      const delay = nextStepTimeRef.current - now + swingDelayMs;
      scheduleStep(step, delay);

      nextStepTimeRef.current += stepDuration;
      currentStepRef.current =
        (currentStepRef.current + 1) % state.sequencer.stepCount;
    }

    while (nextTripletTimeRef.current < now + LOOKAHEAD_MS) {
      let tripletStep = currentTripletStepRef.current;

      if (punchIn === 'repeat' && state.repeatBeatOrigin !== null) {
        const tripletBeatOrigin = Math.floor(state.repeatBeatOrigin / 4) * 6;
        const tripletBeatLength = 6;
        tripletStep = tripletBeatOrigin + ((tripletStep - tripletBeatOrigin) % tripletBeatLength + tripletBeatLength) % tripletBeatLength;
      }

      const delay = nextTripletTimeRef.current - now;
      scheduleTripletStep(tripletStep, delay);

      nextTripletTimeRef.current += tripletDuration;
      currentTripletStepRef.current =
        (currentTripletStepRef.current + 1) % tripletCount;
    }
  }, [getStepDurationMs, getTripletStepDurationMs, scheduleStep, scheduleTripletStep]);

  const start = useCallback(() => {
    if (intervalRef.current) return;

    currentStepRef.current = 0;
    currentTripletStepRef.current = 0;
    nextStepTimeRef.current = Date.now();
    nextTripletTimeRef.current = Date.now();
    setPlaying(true);

    intervalRef.current = setInterval(schedulerTick, TICK_MS);
  }, [schedulerTick, setPlaying]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
    setCurrentStep(0);
    setCurrentTripletStep(0);
    currentStepRef.current = 0;
    currentTripletStepRef.current = 0;
  }, [setPlaying, setCurrentStep, setCurrentTripletStep]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (sequencer.isPlaying && intervalRef.current) {
      clearInterval(intervalRef.current);
      nextStepTimeRef.current = Date.now();
      nextTripletTimeRef.current = Date.now();
      intervalRef.current = setInterval(schedulerTick, TICK_MS);
    }
  }, [sequencer.bpm, schedulerTick, sequencer.isPlaying]);

  return { start, stop, isPlaying: sequencer.isPlaying };
}

// ──────────────────────────────────────────────────
// Exported hook: picks native vs JS based on platform
// ──────────────────────────────────────────────────
export function useSequencer(triggerCallbacks?: Map<number, TriggerCallback>) {
  if (isNativeAvailable) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSequencerIOS();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSequencerJS(triggerCallbacks ?? new Map());
}
