import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../state/useAppStore';

type TriggerCallback = (channelId: number) => void;

export function useSequencer(triggerCallbacks: Map<number, TriggerCallback>) {
  const { sequencer, channels, advanceStep, setCurrentStep, setPlaying } = useAppStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextStepTimeRef = useRef<number>(0);
  const currentStepRef = useRef<number>(0);

  const LOOKAHEAD_MS = 100;
  const TICK_MS = 25;

  const getStepDurationMs = useCallback(() => {
    // Each step is a 16th note: (60000 / bpm) / 4
    return (60000 / sequencer.bpm) / 4;
  }, [sequencer.bpm]);

  const scheduleStep = useCallback(
    (stepIndex: number, delay: number) => {
      const state = useAppStore.getState();
      const hasSolo = state.channels.some((ch) => ch.solo);

      setTimeout(() => {
        // Update visual step indicator
        setCurrentStep(stepIndex);

        // Trigger channels that have this step active
        state.channels.forEach((channel) => {
          if (!channel.sample) return;
          if (channel.muted) return;
          if (hasSolo && !channel.solo) return;
          if (!channel.steps[stepIndex]) return;

          const callback = triggerCallbacks.get(channel.id);
          if (callback) {
            callback(channel.id);
          }
        });
      }, Math.max(0, delay));
    },
    [triggerCallbacks, setCurrentStep],
  );

  const schedulerTick = useCallback(() => {
    const now = Date.now();
    const stepDuration = getStepDurationMs();
    const state = useAppStore.getState();

    while (nextStepTimeRef.current < now + LOOKAHEAD_MS) {
      const delay = nextStepTimeRef.current - now;
      scheduleStep(currentStepRef.current, delay);

      nextStepTimeRef.current += stepDuration;
      currentStepRef.current =
        (currentStepRef.current + 1) % state.sequencer.stepCount;
    }
  }, [getStepDurationMs, scheduleStep]);

  const start = useCallback(() => {
    if (intervalRef.current) return;

    currentStepRef.current = 0;
    nextStepTimeRef.current = Date.now();
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
    currentStepRef.current = 0;
  }, [setPlaying, setCurrentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Restart scheduler when BPM changes during playback
  useEffect(() => {
    if (sequencer.isPlaying && intervalRef.current) {
      clearInterval(intervalRef.current);
      nextStepTimeRef.current = Date.now();
      intervalRef.current = setInterval(schedulerTick, TICK_MS);
    }
  }, [sequencer.bpm, schedulerTick, sequencer.isPlaying]);

  return { start, stop, isPlaying: sequencer.isPlaying };
}
