import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';
import { useAppStore } from '../state/useAppStore';
import { WaveformView } from '../components/editor/WaveformView';
import { TrimHandles } from '../components/editor/TrimHandles';
import { Audio } from 'expo-av';

interface SampleEditScreenProps {
  channelId: number;
  onClose: () => void;
}

export function SampleEditScreen({ channelId, onClose }: SampleEditScreenProps) {
  const channel = useAppStore((s) => s.channels.find((c) => c.id === channelId));
  const { updateSampleTrim, updateSampleRate, updateSamplePreservePitch, updateSampleVolume } =
    useAppStore();

  const sample = channel?.sample;
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const trimStartPercent = sample
    ? sample.trimStartMs / sample.durationMs
    : 0;
  const trimEndPercent = sample
    ? sample.trimEndMs / sample.durationMs
    : 1;

  const handleTrimChange = useCallback(
    (startPercent: number, endPercent: number) => {
      if (!sample) return;
      const startMs = Math.round(startPercent * sample.durationMs);
      const endMs = Math.round(endPercent * sample.durationMs);
      updateSampleTrim(channelId, startMs, endMs);
    },
    [channelId, sample?.durationMs, updateSampleTrim],
  );

  const handlePreview = useCallback(async () => {
    if (!sample) return;

    if (isPreviewPlaying && soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPreviewPlaying(false);
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: sample.uri },
        {
          shouldPlay: true,
          positionMillis: sample.trimStartMs,
          volume: sample.volume,
          rate: sample.playbackRate,
          shouldCorrectPitch: sample.preservePitch,
        },
      );
      soundRef.current = sound;
      setIsPreviewPlaying(true);

      // Stop at trim end
      const playDuration =
        (sample.trimEndMs - sample.trimStartMs) / sample.playbackRate;
      setTimeout(async () => {
        try {
          if (soundRef.current) {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
            soundRef.current = null;
          }
        } catch {}
        setIsPreviewPlaying(false);
      }, playDuration);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPreviewPlaying(false);
        }
      });
    } catch (err) {
      console.error('Preview failed:', err);
      setIsPreviewPlaying(false);
    }
  }, [sample, isPreviewPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  if (!sample) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No sample loaded</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {sample.name}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Waveform with trim handles */}
      <View style={styles.waveformContainer}>
        <WaveformView
          waveformData={sample.waveformData}
          trimStartPercent={trimStartPercent}
          trimEndPercent={trimEndPercent}
        />
        <TrimHandles
          trimStartPercent={trimStartPercent}
          trimEndPercent={trimEndPercent}
          onTrimChange={handleTrimChange}
        />
      </View>

      <View style={styles.trimInfo}>
        <Text style={styles.trimText}>
          Start: {(sample.trimStartMs / 1000).toFixed(2)}s
        </Text>
        <Text style={styles.trimText}>
          End: {(sample.trimEndMs / 1000).toFixed(2)}s
        </Text>
        <Text style={styles.trimText}>
          Duration: {((sample.trimEndMs - sample.trimStartMs) / 1000).toFixed(2)}s
        </Text>
      </View>

      {/* Preview button */}
      <TouchableOpacity
        style={[styles.previewButton, isPreviewPlaying && styles.previewButtonActive]}
        onPress={handlePreview}
      >
        <Text style={styles.previewButtonText}>
          {isPreviewPlaying ? '■ Stop Preview' : '▶ Preview'}
        </Text>
      </TouchableOpacity>

      {/* Speed control */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Speed</Text>
          <Text style={styles.controlValue}>{sample.playbackRate.toFixed(2)}x</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0.25}
          maximumValue={2.0}
          step={0.05}
          value={sample.playbackRate}
          onValueChange={(val) => updateSampleRate(channelId, val)}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>0.25x</Text>
          <Text style={styles.sliderLabel}>1.0x</Text>
          <Text style={styles.sliderLabel}>2.0x</Text>
        </View>
      </View>

      {/* Pitch preservation toggle */}
      <View style={styles.controlSection}>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.controlLabel}>Preserve Pitch</Text>
            <Text style={styles.controlDescription}>
              {sample.preservePitch
                ? 'Time-stretch: speed changes without pitch shift'
                : 'Vinyl mode: speed changes pitch like a turntable'}
            </Text>
          </View>
          <Switch
            value={sample.preservePitch}
            onValueChange={(val) => updateSamplePreservePitch(channelId, val)}
            trackColor={{ false: colors.pine, true: colors.sage }}
            thumbColor={colors.dew}
          />
        </View>
      </View>

      {/* Volume control */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Volume</Text>
          <Text style={styles.controlValue}>{Math.round(sample.volume * 100)}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.05}
          value={sample.volume}
          onValueChange={(val) => updateSampleVolume(channelId, val)}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    color: colors.sage,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: colors.dew,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.stone,
    fontSize: 16,
  },
  waveformContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  trimInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  trimText: {
    color: colors.mint,
    fontSize: 11,
  },
  previewButton: {
    backgroundColor: colors.sage,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  previewButtonActive: {
    backgroundColor: colors.recording,
  },
  previewButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  controlSection: {
    marginBottom: 20,
    backgroundColor: colors.pine,
    borderRadius: 8,
    padding: 12,
  },
  controlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  controlLabel: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: '700',
  },
  controlValue: {
    color: colors.sage,
    fontSize: 14,
    fontWeight: '700',
  },
  controlDescription: {
    color: colors.stone,
    fontSize: 11,
    marginTop: 2,
    maxWidth: 240,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: colors.stone,
    fontSize: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
