import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';
import { getTripletStepCount, getTripletLabel } from '../../types';

const TRIPLETS_PER_ROW = 24;

interface TripletGridProps {
  channelId: number;
}

const TripletButton = React.memo(function TripletButton({
  channelId,
  stepIndex,
}: {
  channelId: number;
  stepIndex: number;
}) {
  const active = useAppStore(
    (s) => s.channels.find((c) => c.id === channelId)?.tripletSteps[stepIndex] ?? false
  );
  const isCurrent = useAppStore(
    (s) => s.sequencer.isPlaying && s.sequencer.currentTripletStep === stepIndex
  );
  const toggleTripletStep = useAppStore((s) => s.toggleTripletStep);

  const isGroupStart = stepIndex % 3 === 0;

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
      style={[styles.step, { backgroundColor: bgColor }]}
      onPress={() => toggleTripletStep(channelId, stepIndex)}
      activeOpacity={0.6}
    />
  );
});

export const TripletGrid = React.memo(function TripletGrid({ channelId }: TripletGridProps) {
  const stepCount = useAppStore((s) => s.sequencer.stepCount);
  const tripletCount = getTripletStepCount(stepCount);

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
            {row.map((i) => (
              <TripletButton
                key={i}
                channelId={channelId}
                stepIndex={i}
              />
            ))}
            {row.length < TRIPLETS_PER_ROW &&
              Array.from({ length: TRIPLETS_PER_ROW - row.length }, (_, j) => (
                <View key={`spacer-${j}`} style={styles.stepSpacer} />
              ))}
          </View>
        ))}
      </View>
    </View>
  );
});

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
