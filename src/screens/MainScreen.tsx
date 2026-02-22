import React, { useRef, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useAppStore } from '../state/useAppStore';
import { TransportBar } from '../components/transport/TransportBar';
import { ChannelRow } from '../components/channels/ChannelRow';
import { useSequencer } from '../hooks/useSequencer';
import { useChannelPlayer } from '../hooks/useChannelPlayer';
import { setupAudioMode } from '../utils/permissions';

interface MainScreenProps {
  onEditSample: (channelId: number) => void;
}

function ChannelPlayerBridge({
  channelId,
  triggerRef,
}: {
  channelId: number;
  triggerRef: React.MutableRefObject<Map<number, () => void>>;
}) {
  const channel = useAppStore((s) => s.channels.find((c) => c.id === channelId));
  const { trigger } = useChannelPlayer(channel || {
    id: channelId, label: '', sample: null, steps: [], muted: true, solo: false, volume: 0,
  });

  useEffect(() => {
    triggerRef.current.set(channelId, trigger);
    return () => {
      triggerRef.current.delete(channelId);
    };
  }, [trigger, channelId, triggerRef]);

  return null;
}

export function MainScreen({ onEditSample }: MainScreenProps) {
  const channels = useAppStore((s) => s.channels);
  const addChannel = useAppStore((s) => s.addChannel);
  const triggerRef = useRef<Map<number, () => void>>(new Map());

  // The sequencer calls triggerRef dynamically — no hardcoded channel list
  const triggerCallbackRef = useRef((channelId: number) => {
    const trigger = triggerRef.current.get(channelId);
    if (trigger) trigger();
  });

  // Build a stable Map that the sequencer can use
  // We use a ref-based approach so the sequencer always looks up from triggerRef
  const triggerCallbacks = useRef(
    new Map<number, (channelId: number) => void>(),
  );

  // Keep the callback map in sync with channels
  useEffect(() => {
    const map = triggerCallbacks.current;
    // Add any new channels
    for (const ch of channels) {
      if (!map.has(ch.id)) {
        map.set(ch.id, (channelId: number) => {
          const trigger = triggerRef.current.get(channelId);
          if (trigger) trigger();
        });
      }
    }
    // Remove deleted channels
    const channelIds = new Set(channels.map((c) => c.id));
    for (const id of map.keys()) {
      if (!channelIds.has(id)) {
        map.delete(id);
      }
    }
  }, [channels]);

  const { start, stop, isPlaying } = useSequencer(triggerCallbacks.current);

  useEffect(() => {
    setupAudioMode();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.forest} />

      {/* Hidden player bridges - manages audio players for each channel */}
      {channels.map((ch) => (
        <ChannelPlayerBridge
          key={ch.id}
          channelId={ch.id}
          triggerRef={triggerRef}
        />
      ))}

      <TransportBar onPlay={start} onStop={stop} isPlaying={isPlaying} />

      <ScrollView style={styles.channelList} contentContainerStyle={styles.channelListContent}>
        {channels.map((ch) => (
          <ChannelRow
            key={ch.id}
            channelId={ch.id}
            onEditSample={onEditSample}
            triggerRef={triggerRef}
            canRemove={channels.length > 1}
          />
        ))}

        <TouchableOpacity style={styles.addChannelBtn} onPress={() => addChannel()}>
          <Text style={styles.addChannelText}>+ Add Channel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  channelList: {
    flex: 1,
  },
  channelListContent: {
    paddingBottom: 20,
  },
  addChannelBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.fern,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addChannelText: {
    color: colors.fern,
    fontSize: 14,
    fontWeight: '600',
  },
});
