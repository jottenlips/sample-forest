import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StepButton } from './StepButton';
import { useAppStore } from '../../state/useAppStore';

const STEPS_PER_ROW = 16;

interface SequencerGridProps {
  channelId: number;
}

export const SequencerGrid = React.memo(function SequencerGrid({ channelId }: SequencerGridProps) {
  const stepCount = useAppStore(
    (s) => s.channels.find((c) => c.id === channelId)?.steps.length ?? 0
  );

  if (stepCount === 0) return null;

  const rows: number[][] = [];
  for (let i = 0; i < stepCount; i += STEPS_PER_ROW) {
    rows.push(
      Array.from({ length: Math.min(STEPS_PER_ROW, stepCount - i) }, (_, j) => i + j)
    );
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((i) => (
            <StepButton
              key={i}
              channelId={channelId}
              stepIndex={i}
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
