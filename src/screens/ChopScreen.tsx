import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import Svg, { Rect, Line } from "react-native-svg";
import { colors } from "../theme/colors";
import { useAppStore } from "../state/useAppStore";
import { encodeWav } from "../utils/wavEncoder";
import { detectBpm, beatLengthSec, pickRandomBeats } from "../utils/bpmDetect";

const NUM_CHOPS = 8;

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
  const [selectedBeats, setSelectedBeats] = useState<number[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [matchTempo, setMatchTempo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [chopping, setChopping] = useState(false);

  const screenWidth = Dimensions.get("window").width;
  const waveformWidth = screenWidth - 48;
  const waveformHeight = 140;

  const totalBeats =
    audioBuffer && bpm
      ? Math.floor(audioBuffer.duration / beatLengthSec(bpm))
      : 0;

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

      // Detect BPM and pick random beats
      const detected = detectBpm(decoded);
      setBpm(detected);
      const beats = Math.floor(decoded.duration / beatLengthSec(detected));
      setSelectedBeats(pickRandomBeats(beats, NUM_CHOPS));
    },
    [],
  );

  const handlePickFile = useCallback(async () => {
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
  }, []);

  const handleYouTubeLoad = useCallback(async () => {
    const url = youtubeUrl.trim();
    if (!url) return;

    // Extract video ID from various YouTube URL formats
    const match = url.match(
      /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/,
    );
    if (!match) {
      setError("Invalid YouTube URL");
      return;
    }
    const videoId = match[1];

    setLoading(true);
    setError("");
    setLoadingMessage("Fetching from YouTube...");

    try {
      // Use Piped API to get proxied audio stream
      const res = await fetch(
        `https://pipedapi.kavin.rocks/streams/${videoId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch video info");
      const data = await res.json();

      if (!data.audioStreams?.length) {
        throw new Error("No audio streams found");
      }

      // Pick highest bitrate audio stream
      const best = data.audioStreams.reduce((a: any, b: any) =>
        (a.bitrate ?? 0) > (b.bitrate ?? 0) ? a : b,
      );

      setLoadingMessage("Downloading audio...");
      const audioRes = await fetch(best.url);
      if (!audioRes.ok) throw new Error("Failed to download audio");

      const arrayBuffer = await audioRes.arrayBuffer();
      const audioCtx = new AudioContext();
      setLoadingMessage("Analyzing tempo...");
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);

      const title = data.title || `YouTube ${videoId}`;
      processAudioBuffer(decoded, title);
    } catch (e: any) {
      console.error("YouTube fetch failed:", e);
      setError(e.message || "Failed to load YouTube audio");
    } finally {
      setLoading(false);
    }
  }, [youtubeUrl, processAudioBuffer]);

  const handleReshuffle = useCallback(() => {
    if (!totalBeats) return;
    setSelectedBeats(pickRandomBeats(totalBeats, NUM_CHOPS));
  }, [totalBeats]);

  const handleChop = useCallback(async () => {
    if (!audioBuffer || !bpm || selectedBeats.length === 0) return;
    setChopping(true);

    try {
      const sampleRate = audioBuffer.sampleRate;
      const beatSamples = Math.floor(beatLengthSec(bpm) * sampleRate);
      const rate = matchTempo ? sequencerBpm / bpm : 1.0;

      for (let i = 0; i < selectedBeats.length; i++) {
        const beatIndex = selectedBeats[i];
        const sliceStart = beatIndex * beatSamples;
        const sliceEnd = Math.min(sliceStart + beatSamples, audioBuffer.length);

        const wavBlob = encodeWav(audioBuffer, sliceStart, sliceEnd);
        const blobUrl = URL.createObjectURL(wavBlob);
        const durationMs = ((sliceEnd - sliceStart) / sampleRate) * 1000;

        // Generate waveform for this slice
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
        const normalizedWaveform = sliceWaveform.map((v) => v / wMax);

        const label = `Beat ${beatIndex + 1}`;
        addChannel(label);

        const currentChannels = useAppStore.getState().channels;
        const newChannel = currentChannels[currentChannels.length - 1];

        loadSample(newChannel.id, {
          id: `sample_${Date.now()}_${i}`,
          uri: blobUrl,
          name: `${fileName} [beat ${beatIndex + 1}]`,
          durationMs,
          trimStartMs: 0,
          trimEndMs: durationMs,
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
    bpm,
    selectedBeats,
    fileName,
    matchTempo,
    sequencerBpm,
    addChannel,
    loadSample,
    onClose,
  ]);

  // Build waveform bars with selected-beat highlighting
  const bars = waveformData.map((amp, i) => {
    const percent = i / waveformData.length;
    let highlighted = false;

    if (audioBuffer && bpm && totalBeats > 0) {
      const beatLen = beatLengthSec(bpm);
      for (const beatIdx of selectedBeats) {
        const beatStart = (beatIdx * beatLen) / audioBuffer.duration;
        const beatEnd = ((beatIdx + 1) * beatLen) / audioBuffer.duration;
        if (percent >= beatStart && percent < beatEnd) {
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

  // Beat marker lines for selected beats
  const beatMarkers =
    audioBuffer && bpm
      ? selectedBeats.map((beatIdx) => {
          const beatLen = beatLengthSec(bpm);
          const x =
            ((beatIdx * beatLen) / audioBuffer.duration) * waveformWidth;
          return { key: beatIdx, x };
        })
      : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeBtn}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Chop Song</Text>
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
              {/* 
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.youtubeInputRow}>
                <TextInput
                  style={styles.youtubeInput}
                  placeholder="Paste YouTube link..."
                  placeholderTextColor={colors.stone}
                  value={youtubeUrl}
                  onChangeText={setYoutubeUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.youtubeGoBtn, !youtubeUrl.trim() && styles.youtubeBtnDisabled]}
                  onPress={handleYouTubeLoad}
                  disabled={!youtubeUrl.trim()}
                >
                  <Text style={styles.youtubeGoBtnText}>Load</Text>
                </TouchableOpacity>
              </View> */}

              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </>
          )}
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>

          {/* BPM + beat info */}
          <View style={styles.bpmRow}>
            <View style={styles.bpmBadge}>
              <Text style={styles.bpmValue}>{bpm}</Text>
              <Text style={styles.bpmLabel}>BPM</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.info}>
                {audioBuffer.duration.toFixed(1)}s | {totalBeats} beats |{" "}
                {beatLengthSec(bpm!).toFixed(3)}s per beat
              </Text>
              <Text style={styles.info}>
                {selectedBeats.length} random beats selected
              </Text>
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
            {matchTempo && bpm && (
              <Text style={styles.tempoRate}>
                {(sequencerBpm / bpm).toFixed(2)}x
              </Text>
            )}
          </TouchableOpacity>

          {/* Waveform with highlighted beats */}
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
              {beatMarkers.map((m) => (
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

          {/* Beat labels under waveform */}
          <View style={[styles.beatLabels, { width: waveformWidth }]}>
            {audioBuffer &&
              bpm &&
              selectedBeats.map((beatIdx) => {
                const beatLen = beatLengthSec(bpm);
                const beatCenter =
                  (((beatIdx + 0.5) * beatLen) / audioBuffer.duration) *
                  waveformWidth;
                return (
                  <Text
                    key={beatIdx}
                    style={[styles.beatLabel, { left: beatCenter - 8 }]}
                  >
                    {beatIdx + 1}
                  </Text>
                );
              })}
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={styles.reshuffleBtn}
            onPress={handleReshuffle}
          >
            <Text style={styles.reshuffleBtnText}>Reshuffle Beats</Text>
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
                Chop {selectedBeats.length} Beats
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: 200,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.pine,
  },
  dividerText: {
    color: colors.stone,
    fontSize: 13,
  },
  youtubeInputRow: {
    flexDirection: "row",
    width: "80%",
    maxWidth: 400,
    gap: 8,
  },
  youtubeInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.pine,
    backgroundColor: colors.forest,
    color: colors.cloud,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  youtubeGoBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.fern,
    justifyContent: "center",
    alignItems: "center",
  },
  youtubeBtnDisabled: {
    opacity: 0.4,
  },
  youtubeGoBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: colors.recording,
    fontSize: 13,
    marginTop: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
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
