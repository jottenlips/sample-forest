import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../state/useAppStore';
import { getTripletStepCount } from '../types';

type TriggerCallback = (channelId: number) => void;

export function useSequencer(triggerCallbacks: Map<number, TriggerCallback>) {
  // Only subscribe to the values that should trigger re-renders
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const bpm = useAppStore((s) => s.sequencer.bpm);
  const setPlaying = useAppStore((s) => s.setPlaying);
  const setCurrentStep = useAppStore((s) => s.setCurrentStep);
  const setCurrentTripletStep = useAppStore((s) => s.setCurrentTripletStep);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextStepTimeRef = useRef<number>(0);
  const currentStepRef = useRef<number>(0);
  const nextTripletTimeRef = useRef<number>(0);
  const currentTripletStepRef = useRef<number>(0);

  // Store refs for latest values to avoid stale closures without re-renders
  const triggerCallbacksRef = useRef(triggerCallbacks);
  triggerCallbacksRef.current = triggerCallbacks;

  const LOOKAHEAD_MS = 100;
  const TICK_MS = 25;

  const schedulerTick = useCallback(() => {
    const now = Date.now();
    const state = useAppStore.getState();
    const { sequencer, channels, punchIn, repeatBeatOrigin } = state;

    const baseStepDuration = (60000 / sequencer.bpm) / 4;
    const baseTripletDuration = baseStepDuration * (2 / 3);
    const tripletCount = getTripletStepCount(sequencer.stepCount);

    let stepDuration = baseStepDuration;
    let tripletDuration = baseTripletDuration;
    if (punchIn === 'double') {
      stepDuration = baseStepDuration / 2;
      tripletDuration = baseTripletDuration / 2;
    } else if (punchIn === 'half') {
      stepDuration = baseStepDuration * 2;
      tripletDuration = baseTripletDuration * 2;
    }

    const swingAmount = (sequencer.swing / 100) * 0.75;
    const hasSolo = channels.some((ch) => ch.solo);
    const callbacks = triggerCallbacksRef.current;

    // Build swap map once per tick if needed
    let swapMap: Map<number, number> | null = null;
    if (punchIn === 'swap' && channels.length > 1) {
      const channelIds = channels.map((c) => c.id);
      swapMap = new Map();
      for (let i = 0; i < channelIds.length; i++) {
        swapMap.set(channelIds[i], channelIds[(i + 1) % channelIds.length]);
      }
    }

    // Schedule normal steps
    while (nextStepTimeRef.current < now + LOOKAHEAD_MS) {
      let step = currentStepRef.current;

      if (punchIn === 'repeat' && repeatBeatOrigin !== null) {
        const beatLength = 4;
        step = repeatBeatOrigin + ((step - repeatBeatOrigin) % beatLength + beatLength) % beatLength;
      }

      const isOffbeat = step % 2 === 1;
      const swingDelayMs = isOffbeat ? swingAmount * stepDuration : 0;
      const delay = nextStepTimeRef.current - now + swingDelayMs;

      const capturedStep = step;
      setTimeout(() => {
        setCurrentStep(capturedStep);

        channels.forEach((channel) => {
          if (!channel.steps[capturedStep]) return;
          if (channel.muted) return;
          if (hasSolo && !channel.solo) return;

          if (punchIn === 'swap' && swapMap) {
            const swappedId = swapMap.get(channel.id);
            if (swappedId !== undefined) {
              const swappedChannel = channels.find((c) => c.id === swappedId);
              if (swappedChannel?.sample) {
                const callback = callbacks.get(swappedId);
                if (callback) callback(swappedId);
              }
            }
          } else {
            if (!channel.sample) return;
            const callback = callbacks.get(channel.id);
            if (callback) callback(channel.id);
          }
        });
      }, Math.max(0, delay));

      nextStepTimeRef.current += stepDuration;
      currentStepRef.current = (currentStepRef.current + 1) % sequencer.stepCount;
    }

    // Schedule triplet steps
    while (nextTripletTimeRef.current < now + LOOKAHEAD_MS) {
      let tripletStep = currentTripletStepRef.current;

      if (punchIn === 'repeat' && repeatBeatOrigin !== null) {
        const tripletBeatOrigin = Math.floor(repeatBeatOrigin / 4) * 6;
        const tripletBeatLength = 6;
        tripletStep = tripletBeatOrigin + ((tripletStep - tripletBeatOrigin) % tripletBeatLength + tripletBeatLength) % tripletBeatLength;
      }

      const delay = nextTripletTimeRef.current - now;
      const capturedTripletStep = tripletStep;

      setTimeout(() => {
        setCurrentTripletStep(capturedTripletStep);

        channels.forEach((channel) => {
          if (!channel.tripletSteps[capturedTripletStep]) return;
          if (channel.muted) return;
          if (hasSolo && !channel.solo) return;

          if (punchIn === 'swap' && swapMap) {
            const swappedId = swapMap.get(channel.id);
            if (swappedId !== undefined) {
              const swappedChannel = channels.find((c) => c.id === swappedId);
              if (swappedChannel?.sample) {
                const callback = callbacks.get(swappedId);
                if (callback) callback(swappedId);
              }
            }
          } else {
            if (!channel.sample) return;
            const callback = callbacks.get(channel.id);
            if (callback) callback(channel.id);
          }
        });
      }, Math.max(0, delay));

      nextTripletTimeRef.current += tripletDuration;
      currentTripletStepRef.current = (currentTripletStepRef.current + 1) % tripletCount;
    }
  }, [setCurrentStep, setCurrentTripletStep]);

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
    if (isPlaying && intervalRef.current) {
      clearInterval(intervalRef.current);
      nextStepTimeRef.current = Date.now();
      nextTripletTimeRef.current = Date.now();
      intervalRef.current = setInterval(schedulerTick, TICK_MS);
    }
  }, [bpm, schedulerTick, isPlaying]);

  return { start, stop, isPlaying };
}
