import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StepButton } from './StepButton';
import { useAppStore } from '../../state/useAppStore';

interface SequencerGridProps {
  channelId: number;
}

export function SequencerGrid({ channelId }: SequencerGridProps) {
  const channel = useAppStore((s) => s.channels.find((c) => c.id === channelId));
  const currentStep = useAppStore((s) => s.sequencer.currentStep);
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const toggleStep = useAppStore((s) => s.toggleStep);

  if (!channel) return null;

  return (
    <View style={styles.container}>
      {channel.steps.map((active, i) => (
        <StepButton
          key={i}
          active={active}
          isCurrentStep={isPlaying && currentStep === i}
          isDownbeat={i % 4 === 0}
          onPress={() => toggleStep(channelId, i)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
});
