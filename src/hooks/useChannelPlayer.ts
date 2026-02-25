import { useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Channel } from '../types';

const POOL_SIZE = 3;

export function useChannelPlayer(channel: Channel) {
  const poolRef = useRef<Audio.Sound[]>([]);
  const poolIndexRef = useRef(0);
  const isLoadedRef = useRef(false);
  const currentUriRef = useRef<string | null>(null);

  // Load a pool of Sound instances when sample changes
  useEffect(() => {
    const loadPool = async () => {
      // Unload previous pool
      for (const sound of poolRef.current) {
        try { await sound.unloadAsync(); } catch {}
      }
      poolRef.current = [];
      isLoadedRef.current = false;
      poolIndexRef.current = 0;

      if (!channel.sample) {
        currentUriRef.current = null;
        return;
      }

      if (currentUriRef.current === channel.sample.uri && isLoadedRef.current) {
        return;
      }

      try {
        const sounds: Audio.Sound[] = [];
        for (let i = 0; i < POOL_SIZE; i++) {
          const { sound } = await Audio.Sound.createAsync(
            { uri: channel.sample.uri },
            {
              shouldPlay: false,
              volume: channel.sample.volume * channel.volume,
              rate: channel.sample.playbackRate,
              shouldCorrectPitch: channel.sample.preservePitch,
            },
          );
          sounds.push(sound);
        }
        poolRef.current = sounds;
        isLoadedRef.current = true;
        currentUriRef.current = channel.sample.uri;
      } catch (err) {
        console.error(`Failed to load sounds for channel ${channel.id}:`, err);
      }
    };

    loadPool();

    return () => {
      for (const sound of poolRef.current) {
        sound.unloadAsync().catch(() => {});
      }
      poolRef.current = [];
      isLoadedRef.current = false;
    };
  }, [channel.sample?.uri]);

  // Update playback settings on all pool instances
  useEffect(() => {
    if (!isLoadedRef.current || !channel.sample) return;

    const status = {
      volume: channel.sample.volume * channel.volume,
      rate: channel.sample.playbackRate,
      shouldCorrectPitch: channel.sample.preservePitch,
    };

    for (const sound of poolRef.current) {
      sound.setStatusAsync(status).catch(() => {});
    }
  }, [
    channel.sample?.volume,
    channel.sample?.playbackRate,
    channel.sample?.preservePitch,
    channel.volume,
  ]);

  const trigger = useCallback(() => {
    if (!isLoadedRef.current || !channel.sample || poolRef.current.length === 0) return;
    if (channel.muted) return;

    // Round-robin through the pool — fire and forget (no await)
    const sound = poolRef.current[poolIndexRef.current % poolRef.current.length];
    poolIndexRef.current = (poolIndexRef.current + 1) % poolRef.current.length;

    const trimStart = channel.sample.trimStartMs || 0;
    sound.replayAsync({ positionMillis: trimStart }).catch(() => {});

    // Schedule stop at trim end if needed
    if (channel.sample.trimEndMs && channel.sample.trimEndMs < channel.sample.durationMs) {
      const playDuration =
        (channel.sample.trimEndMs - trimStart) / channel.sample.playbackRate;
      setTimeout(() => {
        sound.pauseAsync().catch(() => {});
      }, playDuration);
    }
  }, [channel.sample, channel.muted]);

  const stop = useCallback(() => {
    for (const sound of poolRef.current) {
      sound.stopAsync().catch(() => {});
    }
  }, []);

  const preview = useCallback(() => {
    trigger();
  }, [trigger]);

  return { trigger, stop, preview };
}
