import React, { useSyncExternalStore, useCallback } from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { stepIndicator } from "../../utils/stepIndicator";

interface StepButtonProps {
  stepIndex: number;
  active: boolean;
  isDownbeat: boolean;
  onPress: () => void;
}

export const StepButton = React.memo(function StepButton({
  stepIndex,
  active,
  isDownbeat,
  onPress,
}: StepButtonProps) {
  // Subscribe to the lightweight step indicator — only re-renders when
  // THIS button's "is current" status actually changes.
  const isCurrentStep = useSyncExternalStore(
    stepIndicator.subscribe,
    useCallback(() => {
      return stepIndicator.getIsPlaying() && stepIndicator.getStep() === stepIndex;
    }, [stepIndex]),
  );

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
      onPress={onPress}
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
