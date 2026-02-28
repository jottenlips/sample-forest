import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { useAppStore } from '../state/useAppStore';
import { BEAT_PRESETS, BeatPreset } from '../utils/beatPresets';
import { createMultiSynthSample } from '../utils/synthSample';
import { Channel, getTripletStepCount } from '../types';

export function BeatPresetBar() {
  const loadBeatChannels = useAppStore((s) => s.loadBeatChannels);
  const setPlaying = useAppStore((s) => s.setPlaying);
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const [loading, setLoading] = useState<string | null>(null);
  const disabled = loading !== null || isPlaying;

  const applyPreset = useCallback(async (preset: BeatPreset) => {
    setPlaying(false);
    setLoading(preset.label);

    try {
      const stepCount = preset.channels[0].steps.length;
      const tripletCount = getTripletStepCount(stepCount);

      const channels: Channel[] = await Promise.all(
        preset.channels.map(async (def, i) => {
          const sample = await createMultiSynthSample(def.synth, def.label);
          return {
            id: i,
            label: def.label,
            sample,
            steps: [...def.steps],
            tripletSteps: new Array(tripletCount).fill(false),
            muted: false,
            solo: false,
            volume: def.volume,
          };
        })
      );

      loadBeatChannels(channels, preset.bpm, preset.swing, stepCount);
    } catch (err) {
      console.error('Failed to load beat preset:', err);
    } finally {
      setLoading(null);
    }
  }, [loadBeatChannels, setPlaying]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Beats</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {BEAT_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.label}
            style={[styles.btn, disabled && styles.btnDisabled]}
            onPress={() => applyPreset(preset)}
            disabled={disabled}
          >
            {loading === preset.label ? (
              <ActivityIndicator size="small" color={colors.mint} />
            ) : (
              <Text style={styles.btnText}>{preset.label}</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    color: colors.stone,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  scroll: {
    gap: 8,
    paddingRight: 16,
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: colors.pine,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '700',
  },
});
