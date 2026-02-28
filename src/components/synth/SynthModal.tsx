import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';
import { Waveform, NOTE_FREQUENCIES, MultiOscillatorParams, OscillatorLayer, LfoParams, synthesizeMulti } from '../../utils/oscillator';
import { createMultiSynthSample } from '../../utils/synthSample';

const WAVEFORMS: { label: string; value: Waveform }[] = [
  { label: 'Sin', value: 'sine' },
  { label: 'Sqr', value: 'square' },
  { label: 'Saw', value: 'saw' },
  { label: 'Tri', value: 'triangle' },
];

interface LayerState {
  id: number;
  waveform: Waveform;
  freqIndex: number;
  volume: number;
}

let nextLayerId = 1;

function createLayer(waveform: Waveform = 'sine', freqIndex: number = 24, volume: number = 0.8): LayerState {
  return { id: nextLayerId++, waveform, freqIndex, volume };
}

interface Preset {
  label: string;
  layers: { waveform: Waveform; freqIndex: number; volume: number }[];
  noise: number;
  durationMs: number;
  attackMs: number;
  decayMs: number;
  masterVolume: number;
  lfo: LfoParams | null;
}

// C2=0, E2=4, G2=7, C3=12, E3=16, A3=21, C4=24, C5=36, G#5=44, C6=48
const PRESETS: Preset[] = [
  {
    label: 'Pad',
    layers: [
      { waveform: 'sine', freqIndex: 24, volume: 0.6 },     // C4
      { waveform: 'sine', freqIndex: 28, volume: 0.5 },     // E4
      { waveform: 'triangle', freqIndex: 31, volume: 0.4 }, // G4
    ],
    noise: 0.05,
    durationMs: 2000,
    attackMs: 400,
    decayMs: 500,
    masterVolume: 0.7,
    lfo: null,
  },
  {
    label: 'Lead',
    layers: [
      { waveform: 'saw', freqIndex: 24, volume: 1.0 },    // C4 main
      { waveform: 'square', freqIndex: 24, volume: 0.3 },  // C4 body
    ],
    noise: 0,
    durationMs: 500,
    attackMs: 10,
    decayMs: 200,
    masterVolume: 0.8,
    lfo: null,
  },
  {
    label: 'Pluck',
    layers: [
      { waveform: 'triangle', freqIndex: 24, volume: 1.0 }, // C4
      { waveform: 'saw', freqIndex: 36, volume: 0.3 },      // C5 overtone
    ],
    noise: 0.1,
    durationMs: 250,
    attackMs: 0,
    decayMs: 220,
    masterVolume: 0.8,
    lfo: null,
  },
  {
    label: 'Bass',
    layers: [
      { waveform: 'saw', freqIndex: 12, volume: 1.0 },    // C3 fundamental saw
      { waveform: 'saw', freqIndex: 0, volume: 0.6 },     // C2 sub octave saw
      { waveform: 'square', freqIndex: 12, volume: 0.4 }, // C3 square for thickness
    ],
    noise: 0,
    durationMs: 600,
    attackMs: 15,
    decayMs: 350,
    masterVolume: 0.85,
    lfo: null,
  },
];

interface SynthModalProps {
  channelId: number;
  onClose: () => void;
}

export function SynthModal({ channelId, onClose }: SynthModalProps) {
  const loadSample = useAppStore((s) => s.loadSample);

  const [layers, setLayers] = useState<LayerState[]>([createLayer()]);
  const [durationMs, setDurationMs] = useState(500);
  const [attackMs, setAttackMs] = useState(10);
  const [decayMs, setDecayMs] = useState(100);
  const [noise, setNoise] = useState(0);
  const [lfoRate, setLfoRate] = useState(5);
  const [lfoDepth, setLfoDepth] = useState(0);
  const [lfoWaveform, setLfoWaveform] = useState<Waveform>('sine');
  const [lfoTarget, setLfoTarget] = useState<'volume' | 'pitch'>('volume');
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const getParams = useCallback((): MultiOscillatorParams => ({
    layers: layers.map((l): OscillatorLayer => ({
      waveform: l.waveform,
      frequency: NOTE_FREQUENCIES[l.freqIndex].frequency,
      volume: l.volume,
    })),
    noise,
    durationMs,
    attackMs,
    decayMs,
    volume: masterVolume,
    lfo: lfoDepth > 0 ? { rate: lfoRate, depth: lfoDepth, waveform: lfoWaveform, target: lfoTarget } : null,
  }), [layers, noise, durationMs, attackMs, decayMs, masterVolume, lfoRate, lfoDepth, lfoWaveform, lfoTarget]);

  const addLayer = useCallback((waveform: Waveform) => {
    setLayers((prev) => [...prev, createLayer(waveform)]);
  }, []);

  const removeLayer = useCallback((id: number) => {
    setLayers((prev) => prev.length > 1 ? prev.filter((l) => l.id !== id) : prev);
  }, []);

  const updateLayer = useCallback((id: number, updates: Partial<LayerState>) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    setLayers(preset.layers.map((l) => createLayer(l.waveform, l.freqIndex, l.volume)));
    setNoise(preset.noise);
    setDurationMs(preset.durationMs);
    setAttackMs(preset.attackMs);
    setDecayMs(preset.decayMs);
    setMasterVolume(preset.masterVolume);
    if (preset.lfo) {
      setLfoRate(preset.lfo.rate);
      setLfoDepth(preset.lfo.depth);
      setLfoWaveform(preset.lfo.waveform);
      setLfoTarget(preset.lfo.target);
    } else {
      setLfoRate(5);
      setLfoDepth(0);
      setLfoWaveform('sine');
      setLfoTarget('volume');
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (isPreviewPlaying && soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPreviewPlaying(false);
      return;
    }

    try {
      const { wavBuffer } = synthesizeMulti(getParams());
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const uri = URL.createObjectURL(blob);

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: masterVolume },
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
  }, [isPreviewPlaying, getParams, masterVolume]);

  const handleAdd = useCallback(async () => {
    try {
      const params = getParams();
      const layerNames = layers.map((l) => {
        const note = NOTE_FREQUENCIES[l.freqIndex].note;
        return `${l.waveform.slice(0, 3)} ${note}`;
      });
      const name = layerNames.join(' + ');
      const sample = await createMultiSynthSample(params, name);
      loadSample(channelId, sample);
      onClose();
    } catch (err) {
      console.error('Failed to add synth to channel:', err);
      if (Platform.OS === 'web') {
        alert(`Synth error: ${err}`);
      } else {
        Alert.alert('Synth Error', `${err}`);
      }
    }
  }, [getParams, layers, channelId, loadSample, onClose]);

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
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Synth</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Presets */}
      <Text style={styles.sectionTitle}>Presets</Text>
      <View style={styles.presetRow}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.label}
            style={styles.presetBtn}
            onPress={() => applyPreset(p)}
          >
            <Text style={styles.presetBtnText}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Add waveform buttons */}
      <Text style={styles.sectionTitle}>Add Waveform</Text>
      <View style={styles.addWaveRow}>
        {WAVEFORMS.map((w) => (
          <TouchableOpacity
            key={w.value}
            style={styles.addWaveBtn}
            onPress={() => addLayer(w.value)}
          >
            <Text style={styles.addWaveBtnText}>+ {w.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Waveform list */}
      <Text style={styles.sectionTitle}>Waveforms ({layers.length})</Text>
      <View style={styles.waveList}>
        {layers.map((layer) => {
          const noteInfo = NOTE_FREQUENCIES[layer.freqIndex];
          return (
            <View key={layer.id} style={styles.waveRow}>
              <Text style={styles.waveType}>{layer.waveform}</Text>
              <View style={styles.waveControls}>
                <Text style={styles.waveNote}>{noteInfo.note}</Text>
                <Slider
                  style={styles.waveFreqSlider}
                  minimumValue={0}
                  maximumValue={NOTE_FREQUENCIES.length - 1}
                  step={1}
                  value={layer.freqIndex}
                  onValueChange={(v) => updateLayer(layer.id, { freqIndex: v })}
                  minimumTrackTintColor={colors.sage}
                  maximumTrackTintColor={colors.pine}
                  thumbTintColor={colors.mint}
                />
                <Text style={styles.waveVolLabel}>{Math.round(layer.volume * 100)}%</Text>
                <Slider
                  style={styles.waveVolSlider}
                  minimumValue={0}
                  maximumValue={1}
                  step={0.05}
                  value={layer.volume}
                  onValueChange={(v) => updateLayer(layer.id, { volume: v })}
                  minimumTrackTintColor={colors.sage}
                  maximumTrackTintColor={colors.pine}
                  thumbTintColor={colors.mint}
                />
              </View>
              {layers.length > 1 && (
                <TouchableOpacity style={styles.waveRemoveBtn} onPress={() => removeLayer(layer.id)}>
                  <Text style={styles.waveRemoveText}>x</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* Noise */}
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Noise</Text>
          <Text style={styles.controlValue}>{Math.round(noise * 100)}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.05}
          value={noise}
          onValueChange={setNoise}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
      </View>

      {/* LFO */}
      <Text style={styles.sectionTitle}>LFO</Text>
      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Target</Text>
        </View>
        <View style={styles.addWaveRow}>
          {(['volume', 'pitch'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.addWaveBtn, lfoTarget === t && styles.lfoActiveBtn]}
              onPress={() => setLfoTarget(t)}
            >
              <Text style={[styles.addWaveBtnText, lfoTarget === t && styles.lfoActiveBtnText]}>
                {t === 'volume' ? 'Volume' : 'Pitch'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Shape</Text>
        </View>
        <View style={styles.addWaveRow}>
          {WAVEFORMS.map((w) => (
            <TouchableOpacity
              key={w.value}
              style={[styles.addWaveBtn, lfoWaveform === w.value && styles.lfoActiveBtn]}
              onPress={() => setLfoWaveform(w.value)}
            >
              <Text style={[styles.addWaveBtnText, lfoWaveform === w.value && styles.lfoActiveBtnText]}>
                {w.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Rate</Text>
          <Text style={styles.controlValue}>{lfoRate.toFixed(1)} Hz</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0.1}
          maximumValue={20}
          step={0.1}
          value={lfoRate}
          onValueChange={setLfoRate}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Depth</Text>
          <Text style={styles.controlValue}>{Math.round(lfoDepth * 100)}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={lfoDepth}
          onValueChange={setLfoDepth}
          minimumTrackTintColor={colors.sage}
          maximumTrackTintColor={colors.pine}
          thumbTintColor={colors.mint}
        />
      </View>

      {/* Shared envelope + master */}
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

      <View style={styles.controlSection}>
        <View style={styles.controlHeader}>
          <Text style={styles.controlLabel}>Master Volume</Text>
          <Text style={styles.controlValue}>{Math.round(masterVolume * 100)}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.05}
          value={masterVolume}
          onValueChange={setMasterVolume}
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
          {isPreviewPlaying ? 'Stop Preview' : 'Preview'}
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
    marginBottom: 16,
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
  sectionTitle: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.pine,
    alignItems: 'center',
  },
  presetBtnText: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '700',
  },
  addWaveRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  addWaveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.fern,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addWaveBtnText: {
    color: colors.fern,
    fontSize: 13,
    fontWeight: '600',
  },
  lfoActiveBtn: {
    backgroundColor: colors.fern,
    borderColor: colors.fern,
    borderStyle: 'solid',
  },
  lfoActiveBtnText: {
    color: colors.white,
  },
  waveList: {
    gap: 6,
    marginBottom: 16,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.pine,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  waveType: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '700',
    width: 52,
  },
  waveControls: {
    flex: 1,
    gap: 2,
  },
  waveNote: {
    color: colors.sage,
    fontSize: 11,
    fontWeight: '600',
  },
  waveFreqSlider: {
    width: '100%',
    height: 28,
  },
  waveVolLabel: {
    color: colors.stone,
    fontSize: 10,
    fontWeight: '600',
  },
  waveVolSlider: {
    width: '100%',
    height: 28,
  },
  waveRemoveBtn: {
    padding: 6,
  },
  waveRemoveText: {
    color: colors.recording,
    fontSize: 16,
    fontWeight: '700',
  },
  controlSection: {
    marginBottom: 16,
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
