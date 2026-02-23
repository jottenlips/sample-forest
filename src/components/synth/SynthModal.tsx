import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';
import { Waveform, NOTE_FREQUENCIES, OscillatorParams, synthesize } from '../../utils/oscillator';
import { createSynthSample } from '../../utils/synthSample';

const WAVEFORMS: { label: string; value: Waveform }[] = [
  { label: 'Sine', value: 'sine' },
  { label: 'Square', value: 'square' },
  { label: 'Saw', value: 'saw' },
  { label: 'Triangle', value: 'triangle' },
];

interface SynthModalProps {
  channelId: number;
  onClose: () => void;
}

export function SynthModal({ channelId, onClose }: SynthModalProps) {
  const loadSample = useAppStore((s) => s.loadSample);

  const [waveform, setWaveform] = useState<Waveform>('sine');
  const [freqIndex, setFreqIndex] = useState(24); // C4
  const [durationMs, setDurationMs] = useState(500);
  const [attackMs, setAttackMs] = useState(10);
  const [decayMs, setDecayMs] = useState(100);
  const [volume, setVolume] = useState(0.8);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const noteInfo = NOTE_FREQUENCIES[freqIndex];

  const getParams = useCallback((): OscillatorParams => ({
    waveform,
    frequency: noteInfo.frequency,
    durationMs,
    attackMs,
    decayMs,
    volume,
  }), [waveform, noteInfo.frequency, durationMs, attackMs, decayMs, volume]);

  const handlePreview = useCallback(async () => {
    if (isPreviewPlaying && soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPreviewPlaying(false);
      return;
    }

    try {
      const { wavBuffer } = synthesize(getParams());
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const uri = URL.createObjectURL(blob);

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume },
      );
      soundRef.current = sound;
      setIsPreviewPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPreviewPlaying(false);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (err) {
      console.error('Synth preview failed:', err);
      setIsPreviewPlaying(false);
    }
  }, [isPreviewPlaying, getParams, volume]);

  const handleAdd = useCallback(async () => {
    const params = getParams();
    const name = `${waveform} ${noteInfo.note}`;
    const sample = await createSynthSample(params, name);
    loadSample(channelId, sample);
    onClose();
  }, [getParams, waveform, noteInfo.note, channelId, loadSample, onClose]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Synth</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Waveform picker */}
      <View style={styles.controlSection}>
        <Text style={styles.controlLabel}>Waveform</Text>
        <View style={styles.waveformRow}>
          {WAVEFORMS.map((w) => (
            <TouchableOpacity
              key={w.value}
              style={[
                styles.waveformBtn,
                waveform === w.value && styles.waveformBtnActive,
              ]}
              onPress={() => setWaveform(w.value)}
            >
              <Text
                style={[
                  styles.waveformBtnText,
                  waveform === w.value && styles.waveformBtnTextActive,
                ]}
              >
                {w.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Frequency */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Frequency</Text>
          <Text style={styles.controlValue}>
            {noteInfo.note} ({Math.round(noteInfo.frequency)} Hz)
          </Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={NOTE_FREQUENCIES.length - 1}
          step={1}
          value={freqIndex}
          onValueChange={setFreqIndex}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>C2</Text>
          <Text style={styles.sliderLabel}>C4</Text>
          <Text style={styles.sliderLabel}>C6</Text>
        </View>
      </View>

      {/* Duration */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Duration</Text>
          <Text style={styles.controlValue}>{durationMs}ms</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={50}
          maximumValue={2000}
          step={10}
          value={durationMs}
          onValueChange={setDurationMs}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>50ms</Text>
          <Text style={styles.sliderLabel}>1s</Text>
          <Text style={styles.sliderLabel}>2s</Text>
        </View>
      </View>

      {/* Attack */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Attack</Text>
          <Text style={styles.controlValue}>{attackMs}ms</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={500}
          step={5}
          value={attackMs}
          onValueChange={setAttackMs}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
      </View>

      {/* Decay */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Decay</Text>
          <Text style={styles.controlValue}>{decayMs}ms</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={500}
          step={5}
          value={decayMs}
          onValueChange={setDecayMs}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
      </View>

      {/* Volume */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Volume</Text>
          <Text style={styles.controlValue}>{Math.round(volume * 100)}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.05}
          value={volume}
          onValueChange={setVolume}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
      </View>

      {/* Preview */}
      <TouchableOpacity
        style={[styles.previewButton, isPreviewPlaying && styles.previewButtonActive]}
        onPress={handlePreview}
      >
        <Text style={styles.previewButtonText}>
          {isPreviewPlaying ? '■ Stop Preview' : '▶ Preview'}
        </Text>
      </TouchableOpacity>

      {/* Add to Channel */}
      <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
        <Text style={styles.addButtonText}>Add to Channel</Text>
      </TouchableOpacity>
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
  waveformRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  waveformBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.forest,
    alignItems: 'center',
  },
  waveformBtnActive: {
    backgroundColor: colors.sage,
  },
  waveformBtnText: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '600',
  },
  waveformBtnTextActive: {
    color: colors.forest,
  },
  previewButton: {
    backgroundColor: colors.sage,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  previewButtonActive: {
    backgroundColor: colors.recording,
  },
  previewButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  addButton: {
    backgroundColor: colors.fern,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
