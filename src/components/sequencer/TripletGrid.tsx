import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';
import { getTripletStepCount, getTripletLabel } from '../../types';

const TRIPLETS_PER_ROW = 24;

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
  const tripletSteps = channel.tripletSteps.slice(0, tripletCount);

  const rows: number[][] = [];
  for (let i = 0; i < tripletCount; i += TRIPLETS_PER_ROW) {
    rows.push(
      Array.from({ length: Math.min(TRIPLETS_PER_ROW, tripletCount - i) }, (_, j) => i + j)
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{getTripletLabel(stepCount)}</Text>
      <View style={styles.container}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {row.map((i) => {
              const active = tripletSteps[i];
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
            {row.length < TRIPLETS_PER_ROW &&
              Array.from({ length: TRIPLETS_PER_ROW - row.length }, (_, j) => (
                <View key={`spacer-${j}`} style={styles.stepSpacer} />
              ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    gap: 4,
  },
  label: {
    color: '#7B68EE',
    fontSize: 9,
    fontWeight: '800',
    width: 24,
    textAlign: 'right',
    marginTop: 4,
  },
  container: {
    flex: 1,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 1,
  },
  step: {
    flex: 1,
    borderRadius: 3,
    height: 20,
    margin: 1,
  },
  stepSpacer: {
    flex: 1,
    height: 20,
    margin: 1,
  },
});
