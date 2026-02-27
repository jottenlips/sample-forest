import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import { colors } from "../theme/colors";
import { useAppStore } from "../state/useAppStore";
import { encodeWav } from "../utils/wavEncoder";
import { detectBpm, beatLengthSec } from "../utils/bpmDetect";
import { saveSampleFile, generateWaveformData } from "../utils/audioFiles";

const NUM_CHOPS = 8;

/** Pick `count` unique random start times (seconds) that fit within duration - chopLen */
function pickRandomStarts(duration: number, chopLen: number, count: number): number[] {
  const maxStart = duration - chopLen;
  if (maxStart <= 0) return [0];
  const picked = new Set<number>();
  const attempts = count * 20;
  for (let i = 0; i < attempts && picked.size < count; i++) {
    // Round to nearest ms to avoid near-duplicates
    const t = Math.round(Math.random() * maxStart * 1000) / 1000;
    picked.add(t);
  }
  return [...picked].sort((a, b) => a - b);
}

interface ChopScreenProps {
  onClose: () => void;
}

export function ChopScreen({ onClose }: ChopScreenProps) {
  const addChannel = useAppStore((s) => s.addChannel);
  const loadSample = useAppStore((s) => s.loadSample);
  const sequencerBpm = useAppStore((s) => s.sequencer.bpm);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [fileName, setFileName] = useState("");
  const [bpm, setBpm] = useState<number | null>(null);
  const [chopLen, setChopLen] = useState(0.5); // seconds per chop
  const [chopStarts, setChopStarts] = useState<number[]>([]); // start times in seconds
  const [chopLengths, setChopLengths] = useState<Map<number, number>>(new Map()); // per-chop length overrides (index -> seconds)
  const [matchTempo, setMatchTempo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [chopping, setChopping] = useState(false);
  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  const screenWidth = Dimensions.get("window").width;
  const waveformWidth = screenWidth - 48;
  const waveformHeight = 140;

  const processAudioBuffer = useCallback(
    (decoded: AudioBuffer, name: string) => {
      setAudioBuffer(decoded);
      setFileName(name);

      // Generate waveform
      const channelData = decoded.getChannelData(0);
      const points = 200;
      const blockSize = Math.floor(channelData.length / points);
      const waveform: number[] = [];
      for (let i = 0; i < points; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j]);
        }
        waveform.push(sum / blockSize);
      }
      const max = Math.max(...waveform, 0.01);
      setWaveformData(waveform.map((v) => v / max));

      // Detect BPM and use beat length as initial chop length
      const detected = detectBpm(decoded);
      setBpm(detected);
      const detectedBeatLen = beatLengthSec(detected);
      setChopLen(detectedBeatLen);
      setChopStarts(pickRandomStarts(decoded.duration, detectedBeatLen, NUM_CHOPS));
    },
    [],
  );

  const handleChopLenChange = useCallback(
    (val: number) => {
      setChopLen(val);
    },
    [],
  );

  const handlePickFile = useCallback(async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept =
        ".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        setLoading(true);
        setLoadingMessage("Decoding audio...");
        setError("");

        try {
          const arrayBuffer = await file.arrayBuffer();
          const audioCtx = new AudioContext();
          setLoadingMessage("Analyzing tempo...");
          const decoded = await audioCtx.decodeAudioData(arrayBuffer);
          processAudioBuffer(decoded, file.name);
        } catch (e) {
          console.error("Failed to decode audio:", e);
          setError("Failed to decode audio file");
        } finally {
          setLoading(false);
        }
      };
      input.click();
    } else {
      // Native: use DocumentPicker + expo-av for decoding
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: "audio/*",
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        setLoading(true);
        setLoadingMessage("Copying file...");
        setError("");

        const savedUri = await saveSampleFile(asset.uri, asset.name);

        setLoadingMessage("Decoding audio...");

        // Load with expo-av to get duration
        const { sound } = await Audio.Sound.createAsync({ uri: savedUri });
        const status = await sound.getStatusAsync();
        const durationMs = status.isLoaded ? status.durationMillis || 3000 : 3000;
        const durationSec = durationMs / 1000;
        await sound.unloadAsync();

        // Create a minimal "AudioBuffer-like" object for native
        // ChopScreen uses AudioBuffer.duration, .sampleRate, .getChannelData, .length
        // On native we fake it with the info we have
        const fakeSampleRate = 44100;
        const fakeLength = Math.floor(durationSec * fakeSampleRate);
        const fakeChannelData = new Float32Array(fakeLength);
        // Generate a simple waveform approximation (silence - will show flat)
        for (let i = 0; i < fakeLength; i++) {
          fakeChannelData[i] = Math.random() * 0.5;
        }
        const fakeBuffer = {
          duration: durationSec,
          sampleRate: fakeSampleRate,
          length: fakeLength,
          getChannelData: () => fakeChannelData,
          _nativeUri: savedUri,
          _isNative: true,
        } as any;

        processAudioBuffer(fakeBuffer, asset.name);
      } catch (e) {
        console.error("Failed to pick/decode audio:", e);
        setError("Failed to load audio file");
      } finally {
        setLoading(false);
      }
    }
  }, [processAudioBuffer]);

  const handleReshuffle = useCallback(() => {
    if (!audioBuffer) return;
    setChopStarts(pickRandomStarts(audioBuffer.duration, chopLen, NUM_CHOPS));
    setChopLengths(new Map());
  }, [audioBuffer, chopLen]);

  const stopPreview = useCallback(async () => {
    if (previewSoundRef.current) {
      try {
        await previewSoundRef.current.stopAsync();
        await previewSoundRef.current.unloadAsync();
      } catch {}
      previewSoundRef.current = null;
    }
    setPreviewingIdx(null);
  }, []);

  const handlePreviewChop = useCallback(
    async (idx: number) => {
      if (!audioBuffer || chopLen <= 0) return;

      if (previewingIdx === idx) {
        await stopPreview();
        return;
      }

      await stopPreview();

      try {
        const sampleRate = audioBuffer.sampleRate;
        const startSec = chopStarts[idx];
        const thisChopLen = chopLengths.get(idx) ?? chopLen;
        const isNative = (audioBuffer as any)._isNative;
        const nativeUri = (audioBuffer as any)._nativeUri;

        let uri: string;
        let positionMs = 0;
        let playDurationMs = thisChopLen * 1000;

        if (isNative && nativeUri) {
          // On native: play the full file from the chop start position
          uri = nativeUri;
          positionMs = startSec * 1000;
        } else {
          // On web: slice into WAV blob
          const sliceStart = Math.floor(startSec * sampleRate);
          const sliceEnd = Math.min(
            sliceStart + Math.floor(thisChopLen * sampleRate),
            audioBuffer.length,
          );
          const wavBlob = encodeWav(audioBuffer, sliceStart, sliceEnd);
          uri = URL.createObjectURL(wavBlob);
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false },
        );

        if (positionMs > 0) {
          await sound.setPositionAsync(positionMs);
        }
        await sound.playAsync();

        previewSoundRef.current = sound;
        setPreviewingIdx(idx);

        // Auto-stop after chop duration (for native where we play from position)
        if (isNative) {
          setTimeout(async () => {
            try {
              if (previewSoundRef.current === sound) {
                await sound.pauseAsync();
                await sound.unloadAsync();
                previewSoundRef.current = null;
                setPreviewingIdx(null);
              }
            } catch {}
          }, playDurationMs);
        }

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPreviewingIdx(null);
            sound.unloadAsync().catch(() => {});
            previewSoundRef.current = null;
          }
        });
      } catch (err) {
        console.error("Preview failed:", err);
        setPreviewingIdx(null);
      }
    },
    [audioBuffer, chopLen, chopLengths, chopStarts, previewingIdx, stopPreview],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewSoundRef.current) {
        previewSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const handleChop = useCallback(async () => {
    if (!audioBuffer || chopLen <= 0 || chopStarts.length === 0) return;
    setChopping(true);
    await stopPreview();

    try {
      const sampleRate = audioBuffer.sampleRate;
      const isNative = (audioBuffer as any)._isNative;
      const nativeUri = (audioBuffer as any)._nativeUri;

      for (let i = 0; i < chopStarts.length; i++) {
        const startSec = chopStarts[i];
        const thisChopLen = chopLengths.get(i) ?? chopLen;
        const sliceStart = Math.floor(startSec * sampleRate);
        const sliceEnd = Math.min(
          sliceStart + Math.floor(thisChopLen * sampleRate),
          audioBuffer.length,
        );

        const effectiveBpm = 60 / thisChopLen;
        const rate = matchTempo ? sequencerBpm / effectiveBpm : 1.0;
        const durationMs = ((sliceEnd - sliceStart) / sampleRate) * 1000;
        const trimStartMs = startSec * 1000;
        const trimEndMs = trimStartMs + durationMs;

        let uri: string;
        let normalizedWaveform: number[];

        if (isNative && nativeUri) {
          // On native: use the full file URI with trim points
          uri = nativeUri;
          normalizedWaveform = generateWaveformData(50);
        } else {
          // On web: slice AudioBuffer into WAV blob
          const wavBlob = encodeWav(audioBuffer, sliceStart, sliceEnd);
          uri = URL.createObjectURL(wavBlob);

          const channelData = audioBuffer.getChannelData(0);
          const points = 50;
          const blockSize = Math.max(
            1,
            Math.floor((sliceEnd - sliceStart) / points),
          );
          const sliceWaveform: number[] = [];
          for (let p = 0; p < points; p++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(channelData[sliceStart + p * blockSize + j]);
            }
            sliceWaveform.push(sum / blockSize);
          }
          const wMax = Math.max(...sliceWaveform, 0.01);
          normalizedWaveform = sliceWaveform.map((v) => v / wMax);
        }

        const label = `Chop ${i + 1}`;
        addChannel(label);

        const currentChannels = useAppStore.getState().channels;
        const newChannel = currentChannels[currentChannels.length - 1];

        loadSample(newChannel.id, {
          id: `sample_${Date.now()}_${i}`,
          uri,
          name: `${fileName} [${startSec.toFixed(2)}s]`,
          durationMs: isNative ? audioBuffer.duration * 1000 : durationMs,
          trimStartMs: isNative ? trimStartMs : 0,
          trimEndMs: isNative ? trimEndMs : durationMs,
          playbackRate: rate,
          preservePitch: matchTempo,
          volume: 1.0,
          waveformData: normalizedWaveform,
        });
      }

      onClose();
    } catch (e) {
      console.error("Failed to chop audio:", e);
    } finally {
      setChopping(false);
    }
  }, [
    audioBuffer,
    chopLen,
    chopLengths,
    chopStarts,
    fileName,
    matchTempo,
    sequencerBpm,
    addChannel,
    loadSample,
    onClose,
    stopPreview,
  ]);

  // Get effective length for a chop (custom or default)
  const getChopLength = useCallback(
    (idx: number) => chopLengths.get(idx) ?? chopLen,
    [chopLengths, chopLen],
  );

  // Adjust an individual chop's length
  const adjustChopLength = useCallback(
    (idx: number, delta: number) => {
      setChopLengths((prev) => {
        const next = new Map(prev);
        const current = next.get(idx) ?? chopLen;
        const newLen = Math.max(0.05, Math.round((current + delta) * 1000) / 1000);
        if (!audioBuffer) {
          next.set(idx, newLen);
          return next;
        }
        // Clamp so chop doesn't exceed audio duration
        const maxLen = audioBuffer.duration - chopStarts[idx];
        next.set(idx, Math.min(newLen, maxLen));
        return next;
      });
    },
    [chopLen, audioBuffer, chopStarts],
  );

  // Reset a chop's length back to the default
  const resetChopLength = useCallback(
    (idx: number) => {
      setChopLengths((prev) => {
        const next = new Map(prev);
        next.delete(idx);
        return next;
      });
    },
    [],
  );

  // Remove a chop by index
  const removeChop = useCallback((idx: number) => {
    setChopStarts((prev) => prev.filter((_, i) => i !== idx));
    setChopLengths((prev) => {
      const next = new Map<number, number>();
      // Re-index remaining chops
      let newIdx = 0;
      for (let i = 0; i < prev.size + 1; i++) {
        if (i === idx) continue;
        if (prev.has(i)) next.set(newIdx, prev.get(i)!);
        newIdx++;
      }
      return next;
    });
  }, []);

  // Nudge a chop's start position left or right
  const nudgeChop = useCallback(
    (idx: number, direction: -1 | 1) => {
      if (!audioBuffer) return;
      const thisLen = chopLengths.get(idx) ?? chopLen;
      // Nudge by 10% of chop length per tap
      const nudgeAmount = thisLen * 0.1;
      setChopStarts((prev) => {
        const updated = [...prev];
        const newStart = Math.round((updated[idx] + direction * nudgeAmount) * 1000) / 1000;
        // Clamp within [0, duration - thisLen]
        updated[idx] = Math.max(0, Math.min(newStart, audioBuffer.duration - thisLen));
        return updated;
      });
    },
    [audioBuffer, chopLen, chopLengths],
  );

  // Reshuffle a single chop to a new random position
  const reshuffleSingleChop = useCallback(
    (idx: number) => {
      if (!audioBuffer) return;
      const maxStart = audioBuffer.duration - chopLen;
      if (maxStart <= 0) return;
      setChopStarts((prev) => {
        const newStart = Math.round(Math.random() * maxStart * 1000) / 1000;
        const updated = [...prev];
        updated[idx] = newStart;
        return updated.sort((a, b) => a - b);
      });
    },
    [audioBuffer, chopLen],
  );

  // Build waveform bars with selected-chop highlighting
  const bars = waveformData.map((amp, i) => {
    const percent = i / waveformData.length;
    let highlighted = false;

    if (audioBuffer && chopLen > 0) {
      for (let ci = 0; ci < chopStarts.length; ci++) {
        const startSec = chopStarts[ci];
        const len = chopLengths.get(ci) ?? chopLen;
        const chopStart = startSec / audioBuffer.duration;
        const chopEnd = (startSec + len) / audioBuffer.duration;
        if (percent >= chopStart && percent < chopEnd) {
          highlighted = true;
          break;
        }
      }
    }

    const barWidth = waveformWidth / waveformData.length;
    const barHeight = Math.max(2, amp * waveformHeight * 0.8);
    const center = waveformHeight / 2;

    return {
      key: i,
      x: i * barWidth,
      y: center - barHeight / 2,
      width: Math.max(1, barWidth - 1),
      height: barHeight,
      fill: highlighted ? colors.sage : colors.pine,
    };
  });

  // Chop marker lines
  const chopMarkers =
    audioBuffer && chopLen > 0
      ? chopStarts.map((startSec, idx) => {
          const x = (startSec / audioBuffer.duration) * waveformWidth;
          return { key: idx, x };
        })
      : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeBtn}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Auto Chop Song</Text>
        <View style={{ width: 60 }} />
      </View>

      {!audioBuffer ? (
        <View style={styles.uploadArea}>
          {loading ? (
            <>
              <ActivityIndicator size="large" color={colors.sage} />
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={handlePickFile}
              >
                <Text style={styles.uploadIcon}>+</Text>
                <Text style={styles.uploadText}>Upload File</Text>
              </TouchableOpacity>

              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContentInner}
        >
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>

          {/* BPM + info */}
          <View style={styles.bpmRow}>
            <View style={styles.bpmBadge}>
              <Text style={styles.bpmValue}>{bpm}</Text>
              <Text style={styles.bpmLabel}>BPM</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.info}>
                {audioBuffer.duration.toFixed(1)}s total
              </Text>
              <Text style={styles.info}>
                {chopStarts.length} chops selected
              </Text>
            </View>
          </View>

          {/* Seconds per beat / chop length slider */}
          <View style={styles.controlSection}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlLabel}>Seconds per Beat</Text>
              <Text style={styles.controlValue}>
                {chopLen.toFixed(3)}s
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0.1}
              maximumValue={2.0}
              step={0.001}
              value={chopLen}
              onValueChange={handleChopLenChange}
              minimumTrackTintColor={colors.sage}
              maximumTrackTintColor={colors.pine}
              thumbTintColor={colors.mint}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>0.1s</Text>
              <Text style={styles.sliderLabel}>1.0s</Text>
              <Text style={styles.sliderLabel}>2.0s</Text>
            </View>
          </View>

          {/* Match tempo toggle */}
          <TouchableOpacity
            style={styles.tempoToggle}
            onPress={() => setMatchTempo((v) => !v)}
          >
            <View
              style={[styles.checkbox, matchTempo && styles.checkboxActive]}
            >
              {matchTempo && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.tempoToggleText}>
              Match sequencer tempo ({sequencerBpm} BPM)
            </Text>
            {matchTempo && chopLen > 0 && (
              <Text style={styles.tempoRate}>
                {(sequencerBpm / (60 / chopLen)).toFixed(2)}x
              </Text>
            )}
          </TouchableOpacity>

          {/* Waveform with highlighted chops */}
          <View
            style={[
              styles.waveformContainer,
              { width: waveformWidth, height: waveformHeight },
            ]}
          >
            <Svg width={waveformWidth} height={waveformHeight}>
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
              {chopMarkers.map((m) => (
                <Line
                  key={m.key}
                  x1={m.x}
                  y1={0}
                  x2={m.x}
                  y2={waveformHeight}
                  stroke={colors.mint}
                  strokeWidth={1.5}
                  strokeDasharray="4,3"
                />
              ))}
            </Svg>
          </View>

          {/* Chop labels under waveform */}
          <View style={[styles.beatLabels, { width: waveformWidth }]}>
            {audioBuffer &&
              chopStarts.map((startSec, idx) => {
                const len = chopLengths.get(idx) ?? chopLen;
                const centerX =
                  ((startSec + len / 2) / audioBuffer.duration) *
                  waveformWidth;
                return (
                  <Text
                    key={idx}
                    style={[styles.beatLabel, { left: centerX - 8 }]}
                  >
                    {idx + 1}
                  </Text>
                );
              })}
          </View>

          {/* Selected chops - preview buttons */}
          <Text style={styles.sectionLabel}>Selected Chops</Text>
          <View style={styles.chopList}>
            {chopStarts.map((startSec, idx) => {
              const isPreviewing = previewingIdx === idx;
              const thisLen = getChopLength(idx);
              const hasCustomLen = chopLengths.has(idx);
              return (
                <View key={idx} style={styles.chopItem}>
                  <TouchableOpacity
                    style={[
                      styles.chopPreviewBtn,
                      isPreviewing && styles.chopPreviewBtnActive,
                    ]}
                    onPress={() => handlePreviewChop(idx)}
                  >
                    <Text style={styles.chopPreviewIcon}>
                      {isPreviewing ? "■" : "▶"}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.chopItemInfo}>
                    <Text style={styles.chopItemText}>
                      Chop {idx + 1}
                    </Text>
                    <Text style={styles.chopItemTime}>
                      {startSec.toFixed(2)}s
                    </Text>
                  </View>
                  <View style={styles.chopNudgeControls}>
                    <TouchableOpacity
                      style={styles.chopNudgeBtn}
                      onPress={() => nudgeChop(idx, -1)}
                    >
                      <Text style={styles.chopNudgeBtnText}>{"<"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.chopNudgeBtn}
                      onPress={() => nudgeChop(idx, 1)}
                    >
                      <Text style={styles.chopNudgeBtnText}>{">"}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.chopLenControls}>
                    <TouchableOpacity
                      style={styles.chopLenBtn}
                      onPress={() => adjustChopLength(idx, -chopLen * 0.25)}
                    >
                      <Text style={styles.chopLenBtnText}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => hasCustomLen && resetChopLength(idx)}>
                      <Text style={[styles.chopLenValue, hasCustomLen && styles.chopLenCustom]}>
                        {thisLen.toFixed(3)}s
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.chopLenBtn}
                      onPress={() => adjustChopLength(idx, chopLen * 0.25)}
                    >
                      <Text style={styles.chopLenBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.chopShuffleBtn}
                    onPress={() => reshuffleSingleChop(idx)}
                  >
                    <Text style={styles.chopShuffleText}>↻</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chopRemoveBtn}
                    onPress={() => removeChop(idx)}
                  >
                    <Text style={styles.chopRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={styles.reshuffleBtn}
            onPress={handleReshuffle}
          >
            <Text style={styles.reshuffleBtnText}>Reshuffle All</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chopBtn, chopping && styles.chopBtnDisabled]}
            onPress={handleChop}
            disabled={chopping}
          >
            {chopping ? (
              <ActivityIndicator size="small" color={colors.forest} />
            ) : (
              <Text style={styles.chopBtnText}>
                Chop {chopStarts.length} Beats
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
  },
  closeBtn: {
    color: colors.sage,
    fontSize: 16,
  },
  title: {
    color: colors.cloud,
    fontSize: 18,
    fontWeight: "700",
  },
  uploadArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  uploadBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: colors.fern,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadIcon: {
    color: colors.fern,
    fontSize: 40,
    fontWeight: "300",
    marginBottom: 4,
  },
  uploadText: {
    color: colors.fern,
    fontSize: 14,
    fontWeight: "600",
  },
  loadingText: {
    color: colors.sage,
    fontSize: 14,
  },
  errorText: {
    color: colors.recording,
    fontSize: 13,
    marginTop: 8,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  fileName: {
    color: colors.cloud,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  bpmRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  bpmBadge: {
    backgroundColor: colors.pine,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  bpmValue: {
    color: colors.mint,
    fontSize: 22,
    fontWeight: "800",
  },
  bpmLabel: {
    color: colors.sage,
    fontSize: 10,
    fontWeight: "600",
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  info: {
    color: colors.sage,
    fontSize: 12,
  },
  controlSection: {
    marginBottom: 16,
    backgroundColor: colors.pine,
    borderRadius: 8,
    padding: 12,
  },
  controlHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  controlLabel: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: "700",
  },
  controlValue: {
    color: colors.sage,
    fontSize: 14,
    fontWeight: "700",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderLabel: {
    color: colors.stone,
    fontSize: 10,
  },
  tempoToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.fern,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: colors.sage,
    borderColor: colors.sage,
  },
  checkmark: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: "800",
  },
  tempoToggleText: {
    color: colors.cloud,
    fontSize: 13,
    flex: 1,
  },
  tempoRate: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: "700",
  },
  waveformContainer: {
    alignSelf: "center",
    backgroundColor: colors.forest,
    borderRadius: 8,
    overflow: "hidden",
  },
  beatLabels: {
    height: 18,
    position: "relative",
    alignSelf: "center",
    marginTop: 2,
  },
  beatLabel: {
    position: "absolute",
    top: 2,
    color: colors.mint,
    fontSize: 9,
    fontWeight: "600",
  },
  sectionLabel: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  chopList: {
    gap: 4,
  },
  chopItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.pine,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
  },
  chopPreviewBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.fern,
    alignItems: "center",
    justifyContent: "center",
  },
  chopPreviewBtnActive: {
    backgroundColor: colors.recording,
  },
  chopPreviewIcon: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  chopItemInfo: {
    flex: 1,
  },
  chopItemText: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: "600",
  },
  chopItemTime: {
    color: colors.stone,
    fontSize: 11,
  },
  chopNudgeControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  chopNudgeBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: colors.pine,
    borderWidth: 1,
    borderColor: colors.fern,
    alignItems: "center",
    justifyContent: "center",
  },
  chopNudgeBtnText: {
    color: colors.sage,
    fontSize: 14,
    fontWeight: "700",
  },
  chopLenControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chopLenBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.fern,
    alignItems: "center",
    justifyContent: "center",
  },
  chopLenBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  chopLenValue: {
    color: colors.sage,
    fontSize: 11,
    fontWeight: "600",
    minWidth: 44,
    textAlign: "center",
  },
  chopLenCustom: {
    color: colors.mint,
    fontWeight: "700",
  },
  chopShuffleBtn: {
    padding: 4,
  },
  chopShuffleText: {
    color: colors.sage,
    fontSize: 18,
    fontWeight: "700",
  },
  chopRemoveBtn: {
    padding: 4,
  },
  chopRemoveText: {
    color: colors.recording,
    fontSize: 16,
    fontWeight: "700",
  },
  reshuffleBtn: {
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.fern,
    alignItems: "center",
  },
  reshuffleBtnText: {
    color: colors.fern,
    fontSize: 14,
    fontWeight: "600",
  },
  chopBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.sage,
    alignItems: "center",
  },
  chopBtnDisabled: {
    opacity: 0.6,
  },
  chopBtnText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: "700",
  },
});
