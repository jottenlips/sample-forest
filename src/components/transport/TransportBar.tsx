import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';
import { SceneBar } from './SceneBar';

interface TransportBarProps {
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
}

export function TransportBar({ onPlay, onStop, isPlaying }: TransportBarProps) {
  const bpm = useAppStore((s) => s.sequencer.bpm);
  const swing = useAppStore((s) => s.sequencer.swing);
  const stepCount = useAppStore((s) => s.sequencer.stepCount);
  const setBpm = useAppStore((s) => s.setBpm);
  const setSwing = useAppStore((s) => s.setSwing);
  const setStepCount = useAppStore((s) => s.setStepCount);
  const stepOptions = [8, 16, 24, 32];
  const [localBpm, setLocalBpm] = useState(bpm);
  const [localSwing, setLocalSwing] = useState(swing);
  const [draggingBpm, setDraggingBpm] = useState(false);
  const [draggingSwing, setDraggingSwing] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={() => {
            Alert.alert('DEBUG', `isPlaying: ${isPlaying}, onPlay: ${typeof onPlay}, onStop: ${typeof onStop}`);
            if (isPlaying) {
              onStop();
            } else {
              onPlay();
            }
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.playButtonText}>{isPlaying ? '■' : '▶'}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>SAMPLE FOREST</Text>

        <View style={styles.stepsContainer}>
          <Text style={styles.label}>STEPS</Text>
          <View style={styles.stepsRow}>
            {stepOptions.map((count) => (
              <TouchableOpacity
                key={count}
                style={[
                  styles.stepOption,
                  stepCount === count && styles.stepOptionActive,
                ]}
                onPress={() => setStepCount(count)}
              >
                <Text
                  style={[
                    styles.stepOptionText,
                    stepCount === count && styles.stepOptionTextActive,
                  ]}
                >
                  {count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <SceneBar />

      <View style={styles.sliderRow}>
        <Text style={styles.label}>TEMPO</Text>
        <Slider
          style={styles.slider}
          minimumValue={40}
          maximumValue={240}
          step={1}
          value={draggingBpm ? localBpm : bpm}
          onValueChange={(val) => {
            setLocalBpm(val);
            setDraggingBpm(true);
          }}
          onSlidingComplete={(val) => {
            setBpm(val);
            setDraggingBpm(false);
          }}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
        <Text style={styles.sliderValue}>{draggingBpm ? localBpm : bpm}</Text>
      </View>

      <View style={styles.sliderRow}>
        <Text style={styles.label}>SWING</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={draggingSwing ? localSwing : swing}
          onValueChange={(val) => {
            setLocalSwing(val);
            setDraggingSwing(true);
          }}
          onSlidingComplete={(val) => {
            setSwing(val);
            setDraggingSwing(false);
          }}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
        <Text style={styles.sliderValue}>{draggingSwing ? localSwing : swing}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.forest,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: colors.sage,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
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
  stepsContainer: {
    alignItems: 'center',
  },
  label: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
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
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  slider: {
    flex: 1,
    height: 28,
    marginHorizontal: 8,
  },
  sliderValue: {
    color: colors.sage,
    fontSize: 12,
    fontWeight: '700',
    width: 40,
    textAlign: 'right',
  },
});
