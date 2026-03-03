import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { useAppStore } from "../../state/useAppStore";

interface StepButtonProps {
  channelId: number;
  stepIndex: number;
}

export const StepButton = React.memo(function StepButton({
  channelId,
  stepIndex,
}: StepButtonProps) {
  const active = useAppStore(
    (s) => s.channels.find((c) => c.id === channelId)?.steps[stepIndex] ?? false
  );
  const pitch = useAppStore(
    (s) => s.channels.find((c) => c.id === channelId)?.stepPitches?.[stepIndex] ?? 0
  );
  const isCurrentStep = useAppStore(
    (s) => s.sequencer.isPlaying && s.sequencer.currentStep === stepIndex
  );
  const toggleStep = useAppStore((s) => s.toggleStep);
  const openPitchEdit = useAppStore((s) => s.openPitchEdit);

  const isDownbeat = stepIndex % 4 === 0;
  const hasPitch = active && pitch !== 0;

  const bgColor =
    isCurrentStep && active
      ? colors.seafoam
      : isCurrentStep
        ? colors.fern
        : active && hasPitch
          ? (pitch > 0 ? '#4A90A4' : '#A44A6A')
          : active
            ? colors.sage
            : isDownbeat
              ? "#264F3A"
              : colors.stepOff;

  const handleLongPress = () => {
    if (active) {
      openPitchEdit(channelId, stepIndex, false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.step, { backgroundColor: bgColor }]}
      onPress={() => toggleStep(channelId, stepIndex)}
      onLongPress={handleLongPress}
      delayLongPress={300}
      activeOpacity={0.6}
    >
      {hasPitch && (
        <Text style={styles.pitchLabel}>
          {pitch > 0 ? '+' : ''}{pitch}
        </Text>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  step: {
    flex: 1,
    height: 34,
    borderRadius: 4,
    margin: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pitchLabel: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '800',
  },
});
