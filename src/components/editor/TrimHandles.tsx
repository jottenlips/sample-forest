import React, { useRef, useEffect, useMemo } from 'react';
import { View, PanResponder, StyleSheet, Dimensions, Text } from 'react-native';
import { colors } from '../../theme/colors';

interface TrimHandlesProps {
  trimStartPercent: number;
  trimEndPercent: number;
  onTrimChange: (startPercent: number, endPercent: number) => void;
  width?: number;
  height?: number;
}

export function TrimHandles({
  trimStartPercent,
  trimEndPercent,
  onTrimChange,
  width: propWidth,
  height = 120,
}: TrimHandlesProps) {
  const screenWidth = Dimensions.get('window').width;
  const width = propWidth || screenWidth - 48;

  // Keep latest values in refs so PanResponder closures always read fresh state
  const trimStartRef = useRef(trimStartPercent);
  const trimEndRef = useRef(trimEndPercent);
  const onTrimChangeRef = useRef(onTrimChange);
  const widthRef = useRef(width);

  useEffect(() => { trimStartRef.current = trimStartPercent; }, [trimStartPercent]);
  useEffect(() => { trimEndRef.current = trimEndPercent; }, [trimEndPercent]);
  useEffect(() => { onTrimChangeRef.current = onTrimChange; }, [onTrimChange]);
  useEffect(() => { widthRef.current = width; }, [width]);

  const grabStartXRef = useRef(0);
  const grabEndXRef = useRef(0);

  const startPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          grabStartXRef.current = trimStartRef.current * widthRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const w = widthRef.current;
          const endPct = trimEndRef.current;
          const newX = Math.max(0, Math.min(grabStartXRef.current + gestureState.dx, endPct * w - 20));
          const newPercent = Math.max(0, Math.min(newX / w, endPct - 0.02));
          onTrimChangeRef.current(newPercent, endPct);
        },
      }),
    [],
  );

  const endPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          grabEndXRef.current = trimEndRef.current * widthRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const w = widthRef.current;
          const startPct = trimStartRef.current;
          const newX = Math.max(startPct * w + 20, Math.min(grabEndXRef.current + gestureState.dx, w));
          const newPercent = Math.min(1, Math.max(newX / w, startPct + 0.02));
          onTrimChangeRef.current(startPct, newPercent);
        },
      }),
    [],
  );

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="box-none">
      {/* Dimmed region before trim start */}
      <View
        style={[
          styles.dimRegion,
          { left: 0, width: trimStartPercent * width, height },
        ]}
      />
      {/* Dimmed region after trim end */}
      <View
        style={[
          styles.dimRegion,
          { left: trimEndPercent * width, width: (1 - trimEndPercent) * width, height },
        ]}
      />

      {/* Start handle */}
      <View
        {...startPanResponder.panHandlers}
        style={[styles.handle, { left: trimStartPercent * width - 12 }]}
      >
        <View style={styles.handleBar} />
        <Text style={styles.handleLabel}>◁</Text>
      </View>

      {/* End handle */}
      <View
        {...endPanResponder.panHandlers}
        style={[styles.handle, { left: trimEndPercent * width - 4 }]}
      >
        <View style={styles.handleBar} />
        <Text style={styles.handleLabel}>▷</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  dimRegion: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  handle: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleBar: {
    width: 3,
    height: '80%',
    backgroundColor: colors.mint,
    borderRadius: 2,
  },
  handleLabel: {
    color: colors.mint,
    fontSize: 10,
    position: 'absolute',
    bottom: 2,
  },
});
