import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
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
  const isCurrentStep = useAppStore(
    (s) => s.sequencer.isPlaying && s.sequencer.currentStep === stepIndex
  );
  const toggleStep = useAppStore((s) => s.toggleStep);

  const isDownbeat = stepIndex % 4 === 0;

  const bgColor =
    isCurrentStep && active
      ? colors.seafoam
      : isCurrentStep
        ? colors.fern
        : active
          ? colors.sage
          : isDownbeat
            ? "#264F3A"
            : colors.stepOff;

  return (
    <TouchableOpacity
      style={[styles.step, { backgroundColor: bgColor }]}
      onPress={() => toggleStep(channelId, stepIndex)}
      activeOpacity={0.6}
    />
  );
});

const styles = StyleSheet.create({
  step: {
    flex: 1,
    height: 34,
    borderRadius: 4,
    margin: 1,
  },
});
