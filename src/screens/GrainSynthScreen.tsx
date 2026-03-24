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
import { colors } from '../theme/colors';
import { useAppStore } from '../state/useAppStore';
import { Sample } from '../types';
import {
  GrainSynthParams,
  GrainWindow,
  synthesizeGrains,
  decodeAudioToFloat32,
} from '../utils/grainSynth';
import { pickAudioFile } from '../utils/audioFiles';

const WINDOW_SHAPES: { label: string; value: GrainWindow }[] = [
  { label: 'Hann', value: 'hann' },
  { label: 'Triangle', value: 'triangle' },
  { label: 'Tukey', value: 'tukey' },
  { label: 'Smooth', value: 'smooth' },
];

interface GrainSynthScreenProps {
  channelId: number;
  onClose: () => void;
}

export function GrainSynthScreen({ channelId, onClose }: GrainSynthScreenProps) {
  const loadSample = useAppStore((s) => s.loadSample);
  const channel = useAppStore((s) => s.channels.find((c) => c.id === channelId));

  // Source audio state
  const [sourceBuffer, setSourceBuffer] = useState<Float32Array | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Grain parameters
  const [position, setPosition] = useState(0.5);
  const [grainSizeMs, setGrainSizeMs] = useState(50);
  const [grainRate, setGrainRate] = useState(20);
  const [spray, setSpray] = useState(0.05);
  const [pitch, setPitch] = useState(1.0);
  const [windowShape, setWindowShape] = useState<GrainWindow>('smooth');
  const [outputDurationMs, setOutputDurationMs] = useState(1000);
  const [volume, setVolume] = useState(0.8);
  const [gliss, setGliss] = useState(0);

  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Auto-load if channel already has a sample
  useEffect(() => {
    if (channel?.sample && !sourceBuffer) {
      loadSourceFromUri(channel.sample.uri, channel.sample.name);
    }
  }, []);

  const loadSourceFromUri = async (uri: string, name: string) => {
    setLoading(true);
    try {
      const buffer = await decodeAudioToFloat32(uri);
      setSourceBuffer(buffer);
      setSourceName(name);
      setSourceUri(uri);
    } catch (err) {
      console.error('Failed to decode audio:', err);
      const msg = `Could not decode audio: ${err}`;
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    }
    setLoading(false);
  };

  const handlePickFile = useCallback(async () => {
    try {
      const result = await pickAudioFile();
      if (result) {
        await loadSourceFromUri(result.uri, result.name);
      }
    } catch (err) {
      console.error('File pick failed:', err);
    }
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        const msg = 'Microphone permission is required to record audio.';
        Platform.OS === 'web' ? alert(msg) : Alert.alert('Permission Required', msg);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      const msg = `Recording failed: ${err}`;
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (uri) {
        const name = `recording ${new Date().toLocaleTimeString()}`;
        await loadSourceFromUri(uri, name);
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }, []);

  const getParams = useCallback((): GrainSynthParams | null => {
    if (!sourceBuffer) return null;
    return {
      sourceBuffer,
      position,
      grainSizeMs,
      grainRate,
      spray,
      pitch,
      windowShape,
      outputDurationMs,
      volume,
      gliss,
    };
  }, [sourceBuffer, position, grainSizeMs, grainRate, spray, pitch, windowShape, outputDurationMs, volume, gliss]);

  const handlePreview = useCallback(async () => {
    if (isPreviewPlaying && soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPreviewPlaying(false);
      return;
    }

    const params = getParams();
    if (!params) return;

    try {
      const { wavBuffer } = synthesizeGrains(params);
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
      console.error('Grain preview failed:', err);
      setIsPreviewPlaying(false);
    }
  }, [isPreviewPlaying, getParams, volume]);

  const handleAdd = useCallback(async () => {
    const params = getParams();
    if (!params) return;

    try {
      const { wavBuffer, durationMs, waveformData } = synthesizeGrains(params);

      let uri: string;
      if (Platform.OS === 'web') {
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        uri = URL.createObjectURL(blob);
      } else {
        const { Paths, Directory, File } = await import('expo-file-system');
        const samplesDir = new Directory(Paths.document, 'samples');
        if (!samplesDir.exists) samplesDir.create();
        const fileName = `grain_${Date.now()}.wav`;
        const destFile = new File(samplesDir, fileName);
        const bytes = new Uint8Array(wavBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        destFile.create();
        destFile.write(btoa(binary), { encoding: 'base64' });
        uri = destFile.uri;
      }

      const name = `grain ${sourceName || 'synth'} ${grainSizeMs}ms @${grainRate}Hz`;
      const sample: Sample = {
        id: `grain_${Date.now()}`,
        uri,
        name,
        durationMs,
        trimStartMs: 0,
        trimEndMs: durationMs,
        playbackRate: 1.0,
        preservePitch: true,
        volume,
        waveformData,
      };

      loadSample(channelId, sample);
      onClose();
    } catch (err) {
      console.error('Failed to create grain synth sample:', err);
      const msg = `Grain synth error: ${err}`;
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    }
  }, [getParams, sourceName, grainSizeMs, grainRate, channelId, loadSample, onClose, volume]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const isAudioRate = grainRate >= 20;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Grain Synth</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Hero description */}
      <View style={styles.heroSection}>
        <Text style={styles.heroTitle}>Granular Synthesis</Text>
        <Text style={styles.heroSubtitle}>
          Break samples apart to build new sounds. Play any audio file like a synthesizer.
        </Text>
      </View>

      {/* Source sample */}
      <Text style={styles.sectionTitle}>Source Audio</Text>
      <View style={styles.sourceButtons}>
        <TouchableOpacity style={[styles.loadBtn, styles.sourceBtn]} onPress={handlePickFile} disabled={isRecording}>
          <Text style={styles.loadBtnText}>
            {loading ? 'Loading...' : sourceName ? sourceName : '+ Load File'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
          onPress={isRecording ? handleStopRecording : handleStartRecording}
        >
          <Text style={[styles.recordBtnText, isRecording && styles.recordBtnTextActive]}>
            {isRecording ? `Stop ${recordingDuration}s` : 'Record'}
          </Text>
        </TouchableOpacity>
      </View>
      {sourceBuffer && (
        <Text style={styles.sourceInfo}>
          {(sourceBuffer.length / 44100).toFixed(1)}s / {sourceBuffer.length.toLocaleString()} samples
        </Text>
      )}

      {!sourceBuffer && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Load an audio file to use as raw material for granular synthesis.
          </Text>
        </View>
      )}

      {sourceBuffer && (
        <>
          {/* Position */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Position</Text>
              <Text style={styles.controlValue}>{Math.round(position * 100)}%</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={position}
              onValueChange={setPosition}
              minimumTrackTintColor={colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={colors.mint}
            />
            <Text style={styles.hint}>Where in the source to read grains from</Text>
          </View>

          {/* Grain Size */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Grain Size</Text>
              <Text style={styles.controlValue}>{grainSizeMs.toFixed(0)}ms</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={500}
              step={1}
              value={grainSizeMs}
              onValueChange={setGrainSizeMs}
              minimumTrackTintColor={colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={colors.mint}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>1ms</Text>
              <Text style={styles.sliderLabel}>250ms</Text>
              <Text style={styles.sliderLabel}>500ms</Text>
            </View>
          </View>

          {/* Grain Rate */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Grain Rate</Text>
              <Text style={[styles.controlValue, isAudioRate && styles.audioRateValue]}>
                {grainRate} Hz {isAudioRate ? '(audio rate)' : ''}
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={500}
              step={1}
              value={grainRate}
              onValueChange={setGrainRate}
              minimumTrackTintColor={isAudioRate ? colors.warning : colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={isAudioRate ? colors.warning : colors.mint}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>1 Hz (texture)</Text>
              <Text style={[styles.sliderLabel, isAudioRate && styles.audioRateLabel]}>20 Hz+</Text>
              <Text style={styles.sliderLabel}>500 Hz (oscillator)</Text>
            </View>
            {isAudioRate && (
              <Text style={styles.audioRateHint}>
                Grains are now acting like oscillators — the source's spectral character shapes the timbre
              </Text>
            )}
          </View>

          {/* Spray */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Spray</Text>
              <Text style={styles.controlValue}>{Math.round(spray * 100)}%</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={spray}
              onValueChange={setSpray}
              minimumTrackTintColor={colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={colors.mint}
            />
            <Text style={styles.hint}>Randomize grain read position for more texture</Text>
          </View>

          {/* Pitch */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Pitch</Text>
              <Text style={styles.controlValue}>
                {pitch.toFixed(2)}x{' '}
                {pitch === 1 ? '' : pitch > 1 ? '(up)' : '(down)'}
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0.25}
              maximumValue={4}
              step={0.01}
              value={pitch}
              onValueChange={setPitch}
              minimumTrackTintColor={colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={colors.mint}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>-2 oct</Text>
              <Text style={styles.sliderLabel}>original</Text>
              <Text style={styles.sliderLabel}>+2 oct</Text>
            </View>
          </View>

          {/* Gliss */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Gliss</Text>
              <Text style={styles.controlValue}>
                {gliss === 0 ? 'Off' : `${gliss > 0 ? '+' : ''}${Math.round(gliss * 100)}%`}
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={-1}
              maximumValue={1}
              step={0.01}
              value={gliss}
              onValueChange={setGliss}
              minimumTrackTintColor={colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={colors.mint}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>backward</Text>
              <Text style={styles.sliderLabel}>off</Text>
              <Text style={styles.sliderLabel}>forward</Text>
            </View>
            <Text style={styles.hint}>Sweep read position across the source over time</Text>
          </View>

          {/* Window Shape */}
          <Text style={styles.sectionTitle}>Grain Window</Text>
          <View style={styles.windowRow}>
            {WINDOW_SHAPES.map((w) => (
              <TouchableOpacity
                key={w.value}
                style={[styles.windowBtn, windowShape === w.value && styles.windowBtnActive]}
                onPress={() => setWindowShape(w.value)}
              >
                <Text style={[styles.windowBtnText, windowShape === w.value && styles.windowBtnTextActive]}>
                  {w.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Output Duration */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Output Duration</Text>
              <Text style={styles.controlValue}>{(outputDurationMs / 1000).toFixed(1)}s</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={100}
              maximumValue={5000}
              step={50}
              value={outputDurationMs}
              onValueChange={setOutputDurationMs}
              minimumTrackTintColor={colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={colors.mint}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>0.1s</Text>
              <Text style={styles.sliderLabel}>2.5s</Text>
              <Text style={styles.sliderLabel}>5s</Text>
            </View>
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
              {isPreviewPlaying ? 'Stop Preview' : 'Preview'}
            </Text>
          </TouchableOpacity>

          {/* Add to Channel */}
          <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>Add to Channel</Text>
          </TouchableOpacity>
        </>
      )}
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
  heroSection: {
    backgroundColor: colors.pine,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  heroTitle: {
    color: colors.dew,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroSubtitle: {
    color: colors.seafoam,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  sourceButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  sourceBtn: {
    flex: 1,
  },
  loadBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.sage,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  loadBtnText: {
    color: colors.sage,
    fontSize: 14,
    fontWeight: '700',
  },
  recordBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.recording,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnActive: {
    backgroundColor: colors.recording,
  },
  recordBtnText: {
    color: colors.recording,
    fontSize: 14,
    fontWeight: '700',
  },
  recordBtnTextActive: {
    color: colors.white,
  },
  sourceInfo: {
    color: colors.stone,
    fontSize: 11,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.stone,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
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
  audioRateValue: {
    color: colors.warning,
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
  audioRateLabel: {
    color: colors.warning,
    fontWeight: '700',
  },
  audioRateHint: {
    color: colors.warning,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
    fontStyle: 'italic',
  },
  hint: {
    color: colors.stone,
    fontSize: 11,
    marginTop: 4,
  },
  windowRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  windowBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.fern,
    alignItems: 'center',
  },
  windowBtnActive: {
    backgroundColor: colors.fern,
    borderColor: colors.fern,
  },
  windowBtnText: {
    color: colors.fern,
    fontSize: 13,
    fontWeight: '600',
  },
  windowBtnTextActive: {
    color: colors.white,
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
