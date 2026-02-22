import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';
import { getTripletStepCount, getTripletLabel } from '../../types';

interface TripletGridProps {
  channelId: number;
}

export function TripletGrid({ channelId }: TripletGridProps) {
  const channel = useAppStore((s) => s.channels.find((c) => c.id === channelId));
  const currentTripletStep = useAppStore((s) => s.sequencer.currentTripletStep);
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const stepCount = useAppStore((s) => s.sequencer.stepCount);
  const toggleTripletStep = useAppStore((s) => s.toggleTripletStep);

  if (!channel) return null;

  const tripletCount = getTripletStepCount(stepCount);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{getTripletLabel(stepCount)}</Text>
      <View style={styles.container}>
        {channel.tripletSteps.slice(0, tripletCount).map((active, i) => {
          const isCurrent = isPlaying && currentTripletStep === i;
          const isGroupStart = i % 3 === 0;
          const bgColor =
            isCurrent && active
              ? colors.seafoam
              : isCurrent
                ? colors.fern
                : active
                  ? '#7B68EE'
                  : isGroupStart
                    ? '#2A3F55'
                    : '#1E2D3D';

          return (
            <TouchableOpacity
              key={i}
              style={[styles.step, { backgroundColor: bgColor }]}
              onPress={() => toggleTripletStep(channelId, i)}
              activeOpacity={0.6}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 4,
  },
  label: {
    color: '#7B68EE',
    fontSize: 9,
    fontWeight: '800',
    width: 24,
    textAlign: 'right',
  },
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  step: {
    flex: 1,
    minWidth: 8,
    borderRadius: 3,
    height: 20,
    margin: 1,
  },
});
