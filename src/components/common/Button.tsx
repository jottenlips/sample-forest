import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium';
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled,
  style,
}: ButtonProps) {
  const bgColor =
    variant === 'danger'
      ? colors.recording
      : variant === 'secondary'
        ? colors.pine
        : colors.sage;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor: disabled ? colors.stone : bgColor },
        size === 'small' && styles.small,
        style,
      ]}
      activeOpacity={0.7}
    >
      <Text style={[styles.text, size === 'small' && styles.smallText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  text: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  smallText: {
    fontSize: 12,
  },
});
