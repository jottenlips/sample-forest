import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { stepIndicator } from '../utils/stepIndicator';
import { Channel } from '../types';
import * as AudioEngine from '../../modules/audio-engine';

/**
 * Native sequencer hook for iOS.
 * Bridges the Zustand store to the native AVAudioEngine module.
 * All audio scheduling happens natively — JS only syncs state and receives step events.
 */
export function useNativeSequencer() {
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const setPlaying = useAppStore((s) => s.setPlaying);
  const [playing, setLocalPlaying] = useState(false);

  // Track synced state to diff changes
  const syncedChannelIds = useRef<Set<number>>(new Set());
  const syncedSampleUris = useRef<Map<number, string>>(new Map());
  const initialSyncDone = useRef(false);

  // Initial sync: push all current state to native on mount
  useEffect(() => {
    const state = useAppStore.getState();
    const { channels, sequencer } = state;

    // Sync sequencer params
    AudioEngine.updateSequencer(sequencer.bpm, sequencer.stepCount, sequencer.swing);

    // Sync all channels
    for (const channel of channels) {
      AudioEngine.addChannel(channel.id);
      syncedChannelIds.current.add(channel.id);

      // Sync pattern
      AudioEngine.updatePattern(channel.id, channel.steps, channel.tripletSteps);

      // Sync channel state
      AudioEngine.setChannelMuted(channel.id, channel.muted);
      AudioEngine.setChannelSolo(channel.id, channel.solo);
      AudioEngine.setChannelVolume(channel.id, channel.volume);

      // Load sample if present
      if (channel.sample) {
        syncedSampleUris.current.set(channel.id, channel.sample.uri);
        AudioEngine.loadSample(
          channel.id,
          channel.sample.uri,
          channel.sample.trimStartMs,
          channel.sample.trimEndMs,
          channel.sample.playbackRate,
          channel.sample.volume,
          channel.sample.preservePitch,
        ).catch((err: unknown) => console.warn(`[NativeSequencer] Failed to load sample for channel ${channel.id}:`, err));
      }
    }

    initialSyncDone.current = true;

    // Cleanup on unmount
    return () => {
      AudioEngine.stop();
      for (const id of syncedChannelIds.current) {
        AudioEngine.removeChannel(id);
      }
      syncedChannelIds.current.clear();
      syncedSampleUris.current.clear();
    };
  }, []);

  // Subscribe to store changes and push diffs to native
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prevState) => {
      if (!initialSyncDone.current) return;

      const { channels, sequencer, punchIn } = state;
      const prevChannels = prevState.channels;
      const prevSequencer = prevState.sequencer;

      // Sequencer params changed
      if (
        sequencer.bpm !== prevSequencer.bpm ||
        sequencer.stepCount !== prevSequencer.stepCount ||
        sequencer.swing !== prevSequencer.swing
      ) {
        // Handle punch-in BPM modifications
        let effectiveBpm = sequencer.bpm;
        if (punchIn === 'double') effectiveBpm = sequencer.bpm * 2;
        else if (punchIn === 'half') effectiveBpm = sequencer.bpm / 2;

        AudioEngine.updateSequencer(effectiveBpm, sequencer.stepCount, sequencer.swing);
      }

      // Punch-in changed — update BPM sent to native
      if (state.punchIn !== prevState.punchIn) {
        let effectiveBpm = sequencer.bpm;
        if (state.punchIn === 'double') effectiveBpm = sequencer.bpm * 2;
        else if (state.punchIn === 'half') effectiveBpm = sequencer.bpm / 2;

        AudioEngine.updateSequencer(effectiveBpm, sequencer.stepCount, sequencer.swing);
      }

      // Diff channels
      const currentIds = new Set(channels.map((c) => c.id));
      const prevIds = new Set(prevChannels.map((c) => c.id));

      // Added channels
      for (const channel of channels) {
        if (!prevIds.has(channel.id)) {
          AudioEngine.addChannel(channel.id);
          syncedChannelIds.current.add(channel.id);
          AudioEngine.updatePattern(channel.id, channel.steps, channel.tripletSteps);
          AudioEngine.setChannelMuted(channel.id, channel.muted);
          AudioEngine.setChannelSolo(channel.id, channel.solo);
          AudioEngine.setChannelVolume(channel.id, channel.volume);

          if (channel.sample) {
            syncedSampleUris.current.set(channel.id, channel.sample.uri);
            AudioEngine.loadSample(
              channel.id,
              channel.sample.uri,
              channel.sample.trimStartMs,
              channel.sample.trimEndMs,
              channel.sample.playbackRate,
              channel.sample.volume,
              channel.sample.preservePitch,
            ).catch((err: unknown) => console.warn(`[NativeSequencer] load failed:`, err));
          }
        }
      }

      // Removed channels
      for (const prevCh of prevChannels) {
        if (!currentIds.has(prevCh.id)) {
          AudioEngine.removeChannel(prevCh.id);
          syncedChannelIds.current.delete(prevCh.id);
          syncedSampleUris.current.delete(prevCh.id);
        }
      }

      // Diff per-channel state
      for (const channel of channels) {
        const prev = prevChannels.find((c) => c.id === channel.id);
        if (!prev) continue; // new channel, already handled above

        // Pattern changed
        if (channel.steps !== prev.steps || channel.tripletSteps !== prev.tripletSteps) {
          // Handle repeat punch-in: loop a 4-step window
          if (punchIn === 'repeat' && state.repeatBeatOrigin !== null) {
            const origin = state.repeatBeatOrigin;
            const windowSize = 4;
            const repeatedSteps = [...channel.steps];
            for (let i = 0; i < repeatedSteps.length; i++) {
              const srcIdx = origin + ((i - origin) % windowSize + windowSize) % windowSize;
              repeatedSteps[i] = channel.steps[srcIdx] ?? false;
            }
            AudioEngine.updatePattern(channel.id, repeatedSteps, channel.tripletSteps);
          } else {
            AudioEngine.updatePattern(channel.id, channel.steps, channel.tripletSteps);
          }
        }

        // Mute/solo
        if (channel.muted !== prev.muted) {
          AudioEngine.setChannelMuted(channel.id, channel.muted);
        }
        if (channel.solo !== prev.solo) {
          AudioEngine.setChannelSolo(channel.id, channel.solo);
        }

        // Channel volume
        if (channel.volume !== prev.volume) {
          AudioEngine.setChannelVolume(channel.id, channel.volume);
        }

        // Sample changed
        if (channel.sample !== prev.sample) {
          if (!channel.sample) {
            // Sample removed
            AudioEngine.unloadSample(channel.id);
            syncedSampleUris.current.delete(channel.id);
          } else if (
            !prev.sample ||
            channel.sample.uri !== prev.sample.uri ||
            channel.sample.trimStartMs !== prev.sample.trimStartMs ||
            channel.sample.trimEndMs !== prev.sample.trimEndMs ||
            channel.sample.playbackRate !== prev.sample.playbackRate ||
            channel.sample.preservePitch !== prev.sample.preservePitch
          ) {
            // Sample loaded or properties changed that require reload
            syncedSampleUris.current.set(channel.id, channel.sample.uri);
            AudioEngine.loadSample(
              channel.id,
              channel.sample.uri,
              channel.sample.trimStartMs,
              channel.sample.trimEndMs,
              channel.sample.playbackRate,
              channel.sample.volume,
              channel.sample.preservePitch,
            ).catch((err: unknown) => console.warn(`[NativeSequencer] load failed:`, err));
          } else if (channel.sample.volume !== prev.sample.volume) {
            // Just volume changed — no need to reload buffer
            AudioEngine.setSampleVolume(channel.id, channel.sample.volume);
          }
        }
      }

      // Handle swap punch-in: rotate patterns
      if (punchIn === 'swap' && channels.length > 1) {
        // Swap is handled by sending rotated patterns to native
        // Each channel plays the NEXT channel's pattern
        for (let i = 0; i < channels.length; i++) {
          const nextChannel = channels[(i + 1) % channels.length];
          AudioEngine.updatePattern(channels[i].id, nextChannel.steps, nextChannel.tripletSteps);
        }
      }
    });

    return unsub;
  }, []);

  // Subscribe to native step events → feed into stepIndicator
  useEffect(() => {
    const sub = AudioEngine.onStepChange((event) => {
      if (event.step === -1) {
        stepIndicator.setIsPlaying(false);
      } else {
        stepIndicator.setStep(event.step);
        stepIndicator.setTripletStep(event.tripletStep);
      }
    });

    return () => sub.remove();
  }, []);

  const start = useCallback(() => {
    setPlaying(true);
    setLocalPlaying(true);
    stepIndicator.setIsPlaying(true);
    AudioEngine.play();
  }, [setPlaying]);

  const stop = useCallback(() => {
    AudioEngine.stop();
    setPlaying(false);
    setLocalPlaying(false);
    stepIndicator.setIsPlaying(false);
  }, [setPlaying]);

  return { start, stop, isPlaying: playing || isPlaying };
}
