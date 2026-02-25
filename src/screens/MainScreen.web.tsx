import React, { useRef, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useAppStore } from '../state/useAppStore';
import { TransportBar } from '../components/transport/TransportBar';
import { PunchInBar } from '../components/transport/PunchInBar';
import { ChannelRow } from '../components/channels/ChannelRow';
import { useSequencer } from '../hooks/useSequencer';
import { useChannelPlayer } from '../hooks/useChannelPlayer';
import { setupAudioMode } from '../utils/permissions';
import { BeatPresetBar } from '../components/BeatPresetBar';

interface MainScreenProps {
  onEditSample: (channelId: number) => void;
  onOpenSynth: (channelId: number) => void;
  onChopSong: () => void;
  onExport: () => void;
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
    id: channelId, label: '', sample: null, steps: [], tripletSteps: [], muted: true, solo: false, volume: 0,
  });

  useEffect(() => {
    triggerRef.current.set(channelId, trigger);
    return () => {
      triggerRef.current.delete(channelId);
    };
  }, [trigger, channelId, triggerRef]);

  return null;
}

export function MainScreen({ onEditSample, onOpenSynth, onChopSong, onExport }: MainScreenProps) {
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

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.addChannelBtn} onPress={() => addChannel()}>
          <Text style={styles.addChannelText}>+ Add Channel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chopBtn} onPress={onChopSong}>
          <Text style={styles.chopBtnText}>Auto Chop Song</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={onExport}>
          <Text style={styles.exportBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.channelList} contentContainerStyle={styles.channelListContent}>
        <BeatPresetBar />

        {channels.map((ch) => (
          <ChannelRow
            key={ch.id}
            channelId={ch.id}
            onEditSample={onEditSample}
            onOpenSynth={onOpenSynth}
            triggerRef={triggerRef}
            canRemove={channels.length > 1}
          />
        ))}

        <PunchInBar />
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
  buttonRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  addChannelBtn: {
    flex: 1,
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
  chopBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.pine,
    alignItems: 'center',
  },
  chopBtnText: {
    color: colors.sage,
    fontSize: 14,
    fontWeight: '600',
  },
  exportBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.sage,
    alignItems: 'center',
  },
  exportBtnText: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '700',
  },
});
