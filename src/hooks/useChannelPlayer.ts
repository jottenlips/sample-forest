import { useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { Channel } from '../types';
import { isNativeAvailable } from '../../modules/audio-engine';

// ──────────────────────────────────────────────────
// iOS: Native buffer loading via AudioEngine module
// ──────────────────────────────────────────────────
function useChannelPlayerIOS(channel: Channel) {
  const currentUriRef = useRef<string | null>(null);

  useEffect(() => {
    const AudioEngine = require('../../modules/audio-engine');

    const loadNative = async () => {
      // Unload previous
      if (currentUriRef.current && currentUriRef.current !== channel.sample?.uri) {
        try {
          await AudioEngine.unloadSample(`ch_${channel.id}`);
        } catch {}
        currentUriRef.current = null;
      }

      if (!channel.sample) {
        currentUriRef.current = null;
        return;
      }

      if (currentUriRef.current === channel.sample.uri) return;

      try {
        await AudioEngine.loadSample(channel.sample.id, channel.sample.uri);
        currentUriRef.current = channel.sample.uri;
      } catch (err) {
        console.error(`Failed to load native sample for channel ${channel.id}:`, err);
      }
    };

    loadNative();

    return () => {
      if (channel.sample) {
        AudioEngine.unloadSample(channel.sample.id).catch(() => {});
      }
    };
  }, [channel.sample?.uri]);

  const trigger = useCallback(async () => {
    if (!channel.sample || channel.muted) return;
    const AudioEngine = require('../../modules/audio-engine');
    try {
      await AudioEngine.triggerSample(channel.sample.id);
    } catch (err) {
      console.error(`Failed to trigger native sample for channel ${channel.id}:`, err);
    }
  }, [channel.sample, channel.muted]);

  const stop = useCallback(async () => {
    // Native engine handles stopping
  }, []);

  const preview = useCallback(async () => {
    await trigger();
  }, [trigger]);

  return { trigger, stop, preview };
}

// ──────────────────────────────────────────────────
// Web/Android: existing expo-av implementation
// ──────────────────────────────────────────────────
function useChannelPlayerJS(channel: Channel) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const isLoadedRef = useRef(false);
  const currentUriRef = useRef<string | null>(null);

  useEffect(() => {
    const loadSound = async () => {
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
      await soundRef.current.setPositionAsync(channel.sample.trimStartMs || 0);
      await soundRef.current.playAsync();

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

// ──────────────────────────────────────────────────
// Exported hook: picks native vs JS based on platform
// ──────────────────────────────────────────────────
export function useChannelPlayer(channel: Channel) {
  if (isNativeAvailable) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useChannelPlayerIOS(channel);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useChannelPlayerJS(channel);
}
