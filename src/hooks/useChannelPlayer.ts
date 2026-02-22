import { useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Channel } from '../types';

export function useChannelPlayer(channel: Channel) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const isLoadedRef = useRef(false);
  const currentUriRef = useRef<string | null>(null);

  // Load sound when sample changes
  useEffect(() => {
    const loadSound = async () => {
      // Unload previous sound
      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch {}
        soundRef.current = null;
        isLoadedRef.current = false;
      }

      if (!channel.sample) {
        currentUriRef.current = null;
        return;
      }

      // Skip if same URI already loaded
      if (currentUriRef.current === channel.sample.uri && isLoadedRef.current) {
        return;
      }

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: channel.sample.uri },
          {
            shouldPlay: false,
            volume: channel.sample.volume * channel.volume,
            rate: channel.sample.playbackRate,
            shouldCorrectPitch: channel.sample.preservePitch,
          },
        );
        soundRef.current = sound;
        isLoadedRef.current = true;
        currentUriRef.current = channel.sample.uri;
      } catch (err) {
        console.error(`Failed to load sound for channel ${channel.id}:`, err);
      }
    };

    loadSound();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
        isLoadedRef.current = false;
      }
    };
  }, [channel.sample?.uri]);

  // Update playback settings when they change
  useEffect(() => {
    if (!soundRef.current || !isLoadedRef.current || !channel.sample) return;

    soundRef.current.setStatusAsync({
      volume: channel.sample.volume * channel.volume,
      rate: channel.sample.playbackRate,
      shouldCorrectPitch: channel.sample.preservePitch,
    }).catch(() => {});
  }, [
    channel.sample?.volume,
    channel.sample?.playbackRate,
    channel.sample?.preservePitch,
    channel.volume,
  ]);

  const trigger = useCallback(async () => {
    if (!soundRef.current || !isLoadedRef.current || !channel.sample) return;
    if (channel.muted) return;

    try {
      const trimStartSec = (channel.sample.trimStartMs || 0) / 1000;
      await soundRef.current.setPositionAsync(channel.sample.trimStartMs || 0);
      await soundRef.current.playAsync();

      // Schedule stop at trim end
      if (channel.sample.trimEndMs && channel.sample.trimEndMs < channel.sample.durationMs) {
        const playDuration =
          (channel.sample.trimEndMs - (channel.sample.trimStartMs || 0)) /
          channel.sample.playbackRate;
        setTimeout(async () => {
          try {
            if (soundRef.current) {
              await soundRef.current.pauseAsync();
            }
          } catch {}
        }, playDuration);
      }
    } catch (err) {
      console.error(`Failed to trigger channel ${channel.id}:`, err);
    }
  }, [channel.sample, channel.muted]);

  const stop = useCallback(async () => {
    if (!soundRef.current || !isLoadedRef.current) return;
    try {
      await soundRef.current.stopAsync();
    } catch {}
  }, []);

  const preview = useCallback(async () => {
    await trigger();
  }, [trigger]);

  return { trigger, stop, preview };
}
