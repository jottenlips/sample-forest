import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface WaveformViewProps {
  waveformData: number[];
  trimStartPercent: number;
  trimEndPercent: number;
  width?: number;
  height?: number;
}

export function WaveformView({
  waveformData,
  trimStartPercent,
  trimEndPercent,
  width: propWidth,
  height = 120,
}: WaveformViewProps) {
  const screenWidth = Dimensions.get('window').width;
  const width = propWidth || screenWidth - 48;

  const bars = useMemo(() => {
    if (!waveformData.length) return [];

    const barWidth = width / waveformData.length;
    const center = height / 2;

    return waveformData.map((amp, i) => {
      const percent = i / waveformData.length;
      const inTrimRange = percent >= trimStartPercent && percent <= trimEndPercent;
      const barHeight = Math.max(2, amp * height * 0.8);

      return {
        key: i,
        x: i * barWidth,
        y: center - barHeight / 2,
        width: Math.max(1, barWidth - 1),
        height: barHeight,
        fill: inTrimRange ? colors.sage : colors.pine,
      };
    });
  }, [waveformData, trimStartPercent, trimEndPercent, width, height]);

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {bars.map((bar) => (
          <Rect
            key={bar.key}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={1}
            fill={bar.fill}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.forest,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
