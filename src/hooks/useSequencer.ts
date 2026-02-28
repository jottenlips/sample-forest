import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../state/useAppStore';
import { getTripletStepCount } from '../types';
import {
  isNativeAvailable,
  startSequencer,
  stopSequencer,
  updateSequencerConfig,
  addStepChangeListener,
} from '../../modules/audio-engine';

// ──────────────────────────────────────────────────
// iOS: Native AVAudioEngine sequencer via Expo Module
// ──────────────────────────────────────────────────
function useSequencerIOS() {
  const bpm = useAppStore((s) => s.sequencer.bpm);
  const swing = useAppStore((s) => s.sequencer.swing);
  const stepCount = useAppStore((s) => s.sequencer.stepCount);
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const punchIn = useAppStore((s) => s.punchIn);
  const repeatBeatOrigin = useAppStore((s) => s.repeatBeatOrigin);
  const setPlaying = useAppStore((s) => s.setPlaying);

  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const isStartedRef = useRef(false);
  const configUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build native config from current state snapshot
  const buildConfig = useCallback(() => {
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
        stepPitches: ch.stepPitches,
        tripletSteps: ch.tripletSteps,
        tripletStepPitches: ch.tripletStepPitches,
        trimStartMs: ch.sample?.trimStartMs ?? 0,
        trimEndMs: ch.sample?.trimEndMs ?? 0,
        playbackRate: ch.sample?.playbackRate ?? 1.0,
      })),
    };
  }, []);

  // Subscribe to channel changes with a stable selector.
  const channelCount = useAppStore((s) => s.channels.length);
  const channelMuteSoloKey = useAppStore((s) =>
    s.channels.map((ch) => `${ch.id}:${ch.muted}:${ch.solo}`).join(',')
  );
  const channelStepKey = useAppStore((s) =>
    s.channels.map((ch) => {
      const on = ch.steps.reduce((acc, v, i) => v ? acc + i + ',' : acc, '');
      const ton = ch.tripletSteps.reduce((acc, v, i) => v ? acc + i + ',' : acc, '');
      return `${ch.id}:${on}|${ton}`;
    }).join(';')
  );
  const channelSampleKey = useAppStore((s) =>
    s.channels.map((ch) => `${ch.id}:${ch.sample?.id ?? ''}:${ch.volume}`).join(',')
  );

  const start = useCallback(() => {
    if (isStartedRef.current) return;
    isStartedRef.current = true;
    setPlaying(true);

    if (!listenerRef.current) {
      listenerRef.current = addStepChangeListener(
        (event: { currentStep: number; currentTripletStep: number }) => {
          useAppStore.setState((s) => {
            const seq = s.sequencer;
            if (seq.currentStep === event.currentStep &&
                seq.currentTripletStep === event.currentTripletStep) {
              return s;
            }
            return {
              sequencer: {
                ...seq,
                currentStep: event.currentStep,
                currentTripletStep: event.currentTripletStep,
              },
            };
          });
        },
      );
    }

    const config = buildConfig();
    startSequencer(config);
  }, [buildConfig, setPlaying]);

  const stop = useCallback(() => {
    isStartedRef.current = false;
    stopSequencer();
    setPlaying(false);
    useAppStore.setState((s) => ({
      sequencer: { ...s.sequencer, currentStep: 0, currentTripletStep: 0 },
    }));
  }, [setPlaying]);

  // Hot-update config when relevant state changes during playback.
  useEffect(() => {
    if (!isStartedRef.current) return;
    if (configUpdateTimer.current) clearTimeout(configUpdateTimer.current);
    configUpdateTimer.current = setTimeout(() => {
      if (!isStartedRef.current) return;
      const config = buildConfig();
      updateSequencerConfig(config);
    }, 50);
  }, [bpm, swing, stepCount, punchIn, repeatBeatOrigin,
      channelCount, channelMuteSoloKey, channelStepKey, channelSampleKey,
      buildConfig]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (configUpdateTimer.current) {
        clearTimeout(configUpdateTimer.current);
        configUpdateTimer.current = null;
      }
      if (listenerRef.current) {
        listenerRef.current.remove();
        listenerRef.current = null;
      }
      if (isStartedRef.current) {
        stopSequencer();
        isStartedRef.current = false;
      }
    };
  }, []);

  return { start, stop, isPlaying };
}

// ──────────────────────────────────────────────────
// Web: AudioContext-based sequencer
// Uses AudioContext.currentTime (hardware clock) for sample-accurate scheduling.
// A simple setInterval pump fires every 25ms to look ahead and schedule audio.
// The timer's precision doesn't matter — source.start(exactTime) is sample-accurate.
// ──────────────────────────────────────────────────
function useSequencerWeb() {
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const setPlaying = useAppStore((s) => s.setPlaying);

  const schedulerRef = useRef<{
    timer: ReturnType<typeof setInterval> | null;
    nextStepTime: number;
    nextTripletTime: number;
    currentStep: number;
    currentTripletStep: number;
    lastUIUpdate: number;
  }>({
    timer: null,
    nextStepTime: 0,
    nextTripletTime: 0,
    currentStep: 0,
    currentTripletStep: 0,
    lastUIUpdate: 0,
  });

  const start = useCallback(async () => {
    // Lazy import so native never loads this module
    const { webAudioEngine } = require('../audio/webAudioEngine');

    // MUST await resume — iOS Safari requires AudioContext to be
    // unlocked in a user gesture, and pending samples need decoding
    await webAudioEngine.resume();
    setPlaying(true);

    const s = schedulerRef.current;
    const now: number = webAudioEngine.currentTime;
    s.currentStep = 0;
    s.currentTripletStep = 0;
    s.nextStepTime = now;
    s.nextTripletTime = now;
    s.lastUIUpdate = 0;

    const LOOKAHEAD = 0.1; // 100ms look-ahead window
    const TICK_MS = 25;    // pump interval (precision doesn't matter)
    const UI_THROTTLE = 0.1; // ~10fps for step highlight

    s.timer = setInterval(() => {
      const state = useAppStore.getState();
      const { bpm, stepCount, swing } = state.sequencer;
      const { punchIn, repeatBeatOrigin, channels } = state;

      const now: number = webAudioEngine.currentTime;
      const baseStepDur = 60 / bpm / 4; // seconds per 16th note
      const baseTripletDur = baseStepDur * (2 / 3);

      let stepDur = baseStepDur;
      let tripletDur = baseTripletDur;

      if (punchIn === 'double') {
        stepDur = baseStepDur / 2;
        tripletDur = baseTripletDur / 2;
      } else if (punchIn === 'half') {
        stepDur = baseStepDur * 2;
        tripletDur = baseTripletDur * 2;
      }

      const swingAmount = (swing / 100) * 0.75;
      const hasSolo = channels.some((ch) => ch.solo);

      // Build swap map if needed
      let swapMap: Record<number, number> | null = null;
      if (punchIn === 'swap' && channels.length > 1) {
        swapMap = {};
        for (let i = 0; i < channels.length; i++) {
          swapMap[channels[i].id] = channels[(i + 1) % channels.length].id;
        }
      }

      // Schedule normal steps within the look-ahead window
      while (s.nextStepTime < now + LOOKAHEAD) {
        let step = s.currentStep;

        if (punchIn === 'repeat' && repeatBeatOrigin !== null) {
          const beatLength = 4;
          step = repeatBeatOrigin +
            ((step - repeatBeatOrigin) % beatLength + beatLength) % beatLength;
        }

        const isOffbeat = step % 2 === 1;
        const swingDelay = isOffbeat ? swingAmount * stepDur : 0;
        const scheduleTime = s.nextStepTime + swingDelay;

        for (const ch of channels) {
          if (step >= ch.steps.length || !ch.steps[step]) continue;
          if (ch.muted) continue;
          if (hasSolo && !ch.solo) continue;
          if (!ch.sample) continue;

          let target = ch;
          if (punchIn === 'swap' && swapMap) {
            const swappedId = swapMap[ch.id];
            if (swappedId !== undefined) {
              const swapped = channels.find((c) => c.id === swappedId);
              if (swapped?.sample) {
                target = swapped;
              } else {
                continue;
              }
            }
          }

          const sample = target.sample!;
          const pitchSemitones = ch.stepPitches[step] ?? 0;
          const effectiveRate = pitchSemitones !== 0
            ? sample.playbackRate * Math.pow(2, pitchSemitones / 12)
            : sample.playbackRate;
          webAudioEngine.scheduleSample(
            sample.id,
            scheduleTime,
            sample.volume * target.volume,
            effectiveRate,
            sample.trimStartMs ?? 0,
            sample.trimEndMs ?? 0,
            sample.durationMs,
          );
        }

        s.nextStepTime += stepDur;
        s.currentStep = (s.currentStep + 1) % stepCount;
      }

      // Schedule triplet steps
      const tripletCount = getTripletStepCount(stepCount);
      while (s.nextTripletTime < now + LOOKAHEAD) {
        let tripletStep = s.currentTripletStep;

        if (punchIn === 'repeat' && repeatBeatOrigin !== null) {
          const tripletBeatOrigin = Math.floor(repeatBeatOrigin / 4) * 6;
          const tripletBeatLength = 6;
          tripletStep = tripletBeatOrigin +
            ((tripletStep - tripletBeatOrigin) % tripletBeatLength + tripletBeatLength) % tripletBeatLength;
        }

        const scheduleTime = s.nextTripletTime;

        for (const ch of channels) {
          if (tripletStep >= ch.tripletSteps.length || !ch.tripletSteps[tripletStep]) continue;
          if (ch.muted) continue;
          if (hasSolo && !ch.solo) continue;
          if (!ch.sample) continue;

          let target = ch;
          if (punchIn === 'swap' && swapMap) {
            const swappedId = swapMap[ch.id];
            if (swappedId !== undefined) {
              const swapped = channels.find((c) => c.id === swappedId);
              if (swapped?.sample) {
                target = swapped;
              } else {
                continue;
              }
            }
          }

          const sample = target.sample!;
          const pitchSemitones = ch.tripletStepPitches[tripletStep] ?? 0;
          const effectiveRate = pitchSemitones !== 0
            ? sample.playbackRate * Math.pow(2, pitchSemitones / 12)
            : sample.playbackRate;
          webAudioEngine.scheduleSample(
            sample.id,
            scheduleTime,
            sample.volume * target.volume,
            effectiveRate,
            sample.trimStartMs ?? 0,
            sample.trimEndMs ?? 0,
            sample.durationMs,
          );
        }

        s.nextTripletTime += tripletDur;
        s.currentTripletStep = (s.currentTripletStep + 1) % Math.max(1, tripletCount);
      }

      // UI step update (throttled)
      if (now - s.lastUIUpdate >= UI_THROTTLE) {
        s.lastUIUpdate = now;
        useAppStore.setState((prev) => {
          const seq = prev.sequencer;
          if (seq.currentStep === s.currentStep &&
              seq.currentTripletStep === s.currentTripletStep) {
            return prev;
          }
          return {
            sequencer: {
              ...seq,
              currentStep: s.currentStep,
              currentTripletStep: s.currentTripletStep,
            },
          };
        });
      }
    }, TICK_MS);
  }, [setPlaying]);

  const stop = useCallback(() => {
    const s = schedulerRef.current;
    if (s.timer) {
      clearInterval(s.timer);
      s.timer = null;
    }
    setPlaying(false);
    useAppStore.setState((prev) => ({
      sequencer: { ...prev.sequencer, currentStep: 0, currentTripletStep: 0 },
    }));
  }, [setPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (schedulerRef.current.timer) {
        clearInterval(schedulerRef.current.timer);
        schedulerRef.current.timer = null;
      }
    };
  }, []);

  return { start, stop, isPlaying };
}

// ──────────────────────────────────────────────────
// Exported hook: picks native vs web based on platform
// ──────────────────────────────────────────────────
export function useSequencer() {
  if (isNativeAvailable) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSequencerIOS();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSequencerWeb();
}
