import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { StepButton } from './StepButton';
import { useAppStore } from '../../state/useAppStore';

const STEPS_PER_ROW = 16;

interface SequencerGridProps {
  channelId: number;
}

export const SequencerGrid = React.memo(function SequencerGrid({ channelId }: SequencerGridProps) {
  const steps = useAppStore((s) => s.channels.find((c) => c.id === channelId)?.steps);
  const currentStep = useAppStore((s) => s.sequencer.currentStep);
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const toggleStep = useAppStore((s) => s.toggleStep);

  if (!steps) return null;

  const rows: number[][] = [];
  for (let i = 0; i < steps.length; i += STEPS_PER_ROW) {
    rows.push(
      Array.from({ length: Math.min(STEPS_PER_ROW, steps.length - i) }, (_, j) => i + j)
    );
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((i) => (
            <StepButton
              key={i}
              active={steps[i]}
              isCurrentStep={isPlaying && currentStep === i}
              isDownbeat={i % 4 === 0}
              onPress={() => toggleStep(channelId, i)}
            />
          ))}
          {row.length < STEPS_PER_ROW &&
            Array.from({ length: STEPS_PER_ROW - row.length }, (_, j) => (
              <View key={`spacer-${j}`} style={styles.spacer} />
            ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 2,
  },
  spacer: {
    flex: 1,
    height: 34,
    margin: 1,
  },
});
