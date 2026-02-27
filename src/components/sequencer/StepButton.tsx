import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

interface StepButtonProps {
  active: boolean;
  isCurrentStep: boolean;
  isDownbeat: boolean;
  onPress: () => void;
}

export const StepButton = React.memo(function StepButton({
  active,
  isCurrentStep,
  isDownbeat,
  onPress,
}: StepButtonProps) {
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
