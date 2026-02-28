import { useRef, useCallback, useEffect } from 'react';
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
// Web: Web Audio API via shared WebAudioEngine
// Samples are loaded as AudioBuffers for both sequencer
// scheduling (sample-accurate) and preview taps.
// ──────────────────────────────────────────────────
function useChannelPlayerWeb(channel: Channel) {
  const currentUriRef = useRef<string | null>(null);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    const { webAudioEngine } = require('../audio/webAudioEngine');

    const loadSample = async () => {
      // Unload previous if URI changed
      if (currentUriRef.current && currentUriRef.current !== channel.sample?.uri) {
        if (channel.sample) {
          webAudioEngine.unloadSample(channel.sample.id);
        }
        currentUriRef.current = null;
        isLoadedRef.current = false;
      }

      if (!channel.sample) {
        currentUriRef.current = null;
        isLoadedRef.current = false;
        return;
      }

      if (currentUriRef.current === channel.sample.uri && isLoadedRef.current) {
        return;
      }

      try {
        await webAudioEngine.loadSample(channel.sample.id, channel.sample.uri);
        currentUriRef.current = channel.sample.uri;
        isLoadedRef.current = true;
      } catch (err) {
        console.error(`Failed to load web audio sample for channel ${channel.id}:`, err);
      }
    };

    loadSample();

    return () => {
      if (channel.sample) {
        webAudioEngine.unloadSample(channel.sample.id);
        isLoadedRef.current = false;
      }
    };
  }, [channel.sample?.uri]);

  const trigger = useCallback(() => {
    if (!channel.sample || channel.muted || !isLoadedRef.current) return;
    const { webAudioEngine } = require('../audio/webAudioEngine');
    const sample = channel.sample;
    webAudioEngine.triggerSample(
      sample.id,
      sample.volume * channel.volume,
      sample.playbackRate,
      sample.trimStartMs ?? 0,
      sample.trimEndMs ?? 0,
      sample.durationMs,
    );
  }, [channel.sample, channel.muted, channel.volume]);

  const stop = useCallback(() => {
    // Web Audio API nodes auto-stop when done
  }, []);

  const preview = useCallback(() => {
    trigger();
  }, [trigger]);

  return { trigger, stop, preview };
}

// ──────────────────────────────────────────────────
// Exported hook: picks native vs web based on platform
// ──────────────────────────────────────────────────
export function useChannelPlayer(channel: Channel) {
  if (isNativeAvailable) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useChannelPlayerIOS(channel);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useChannelPlayerWeb(channel);
}
