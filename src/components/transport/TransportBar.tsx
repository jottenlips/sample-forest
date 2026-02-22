import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';

interface TransportBarProps {
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
}

export function TransportBar({ onPlay, onStop, isPlaying }: TransportBarProps) {
  const { sequencer, setBpm, setStepCount } = useAppStore();
  const stepOptions = [8, 16, 24, 32];

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>SAMPLE FOREST</Text>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={isPlaying ? onStop : onPlay}
          activeOpacity={0.7}
        >
          <Text style={styles.playButtonText}>{isPlaying ? '■' : '▶'}</Text>
        </TouchableOpacity>

        <View style={styles.bpmContainer}>
          <Text style={styles.label}>BPM</Text>
          <View style={styles.bpmControls}>
            <TouchableOpacity
              style={styles.bpmButton}
              onPress={() => setBpm(sequencer.bpm - 1)}
            >
              <Text style={styles.bpmButtonText}>-</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.bpmInput}
              value={String(sequencer.bpm)}
              keyboardType="number-pad"
              onChangeText={(text) => {
                const val = parseInt(text, 10);
                if (!isNaN(val)) setBpm(val);
              }}
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.bpmButton}
              onPress={() => setBpm(sequencer.bpm + 1)}
            >
              <Text style={styles.bpmButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.stepsContainer}>
          <Text style={styles.label}>STEPS</Text>
          <View style={styles.stepsRow}>
            {stepOptions.map((count) => (
              <TouchableOpacity
                key={count}
                style={[
                  styles.stepOption,
                  sequencer.stepCount === count && styles.stepOptionActive,
                ]}
                onPress={() => setStepCount(count)}
              >
                <Text
                  style={[
                    styles.stepOptionText,
                    sequencer.stepCount === count && styles.stepOptionTextActive,
                  ]}
                >
                  {count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.forest,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: colors.sage,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonActive: {
    backgroundColor: colors.recording,
  },
  playButtonText: {
    color: colors.white,
    fontSize: 20,
  },
  bpmContainer: {
    alignItems: 'center',
  },
  label: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  bpmControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bpmButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpmButtonText: {
    color: colors.sage,
    fontSize: 16,
    fontWeight: '700',
  },
  bpmInput: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    width: 50,
    marginHorizontal: 4,
  },
  stepsContainer: {
    alignItems: 'center',
  },
  stepsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  stepOption: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.pine,
  },
  stepOptionActive: {
    backgroundColor: colors.sage,
  },
  stepOptionText: {
    color: colors.mist,
    fontSize: 12,
    fontWeight: '600',
  },
  stepOptionTextActive: {
    color: colors.forest,
  },
});
