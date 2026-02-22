import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../state/useAppStore';
import { getTripletStepCount } from '../types';

type TriggerCallback = (channelId: number) => void;

export function useSequencer(triggerCallbacks: Map<number, TriggerCallback>) {
  const { sequencer, channels, advanceStep, setCurrentStep, setPlaying } = useAppStore();
  const setCurrentTripletStep = useAppStore((s) => s.setCurrentTripletStep);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextStepTimeRef = useRef<number>(0);
  const currentStepRef = useRef<number>(0);
  // Triplet scheduling runs on its own timeline
  const nextTripletTimeRef = useRef<number>(0);
  const currentTripletStepRef = useRef<number>(0);

  const LOOKAHEAD_MS = 100;
  const TICK_MS = 25;

  const getStepDurationMs = useCallback(() => {
    return (60000 / sequencer.bpm) / 4;
  }, [sequencer.bpm]);

  // Triplet duration: 3 triplet steps span the same time as 2 normal steps
  // So triplet step duration = (2/3) * normal step duration
  const getTripletStepDurationMs = useCallback(() => {
    return ((60000 / sequencer.bpm) / 4) * (2 / 3);
  }, [sequencer.bpm]);

  const scheduleStep = useCallback(
    (stepIndex: number, delay: number) => {
      const state = useAppStore.getState();
      const hasSolo = state.channels.some((ch) => ch.solo);
      const punchIn = state.punchIn;

      // Build a channel-id-to-sample mapping for swap effect
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

      setTimeout(() => {
        setCurrentTripletStep(stepIndex);

        state.channels.forEach((channel) => {
          if (!channel.tripletSteps[stepIndex]) return;
          if (channel.muted) return;
          if (hasSolo && !channel.solo) return;
          if (!channel.sample) return;

          const callback = triggerCallbacks.get(channel.id);
          if (callback) callback(channel.id);
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

    // Apply tempo effects
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

    // Schedule normal steps
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

    // Schedule triplet steps (independent timeline)
    while (nextTripletTimeRef.current < now + LOOKAHEAD_MS) {
      const tripletStep = currentTripletStepRef.current;
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

  // Restart scheduler when BPM or punch-in changes during playback
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
