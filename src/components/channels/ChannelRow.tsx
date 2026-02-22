import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { colors } from "../../theme/colors";
import { useAppStore } from "../../state/useAppStore";
import { SequencerGrid } from "../sequencer/SequencerGrid";
import { TripletGrid } from "../sequencer/TripletGrid";
import { useRecorder } from "../../hooks/useRecorder";
import { pickAudioFile, createSampleFromFile } from "../../utils/audioFiles";
import { Audio } from "expo-av";
import { Sample } from "../../types";

async function getAudioDuration(uri: string): Promise<number> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const audio = new window.Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const ms = isFinite(audio.duration) ? audio.duration * 1000 : 3000;
        resolve(ms);
      };
      audio.onerror = () => resolve(3000);
      audio.src = uri;
    });
  }
  try {
    const { sound } = await Audio.Sound.createAsync({ uri });
    const status = await sound.getStatusAsync();
    const durationMs = status.isLoaded ? status.durationMillis || 3000 : 3000;
    await sound.unloadAsync();
    return durationMs;
  } catch {
    return 3000;
  }
}

interface ChannelRowProps {
  channelId: number;
  onEditSample: (channelId: number) => void;
  triggerRef: React.MutableRefObject<Map<number, () => void>>;
  canRemove: boolean;
}

export function ChannelRow({
  channelId,
  onEditSample,
  triggerRef,
  canRemove,
}: ChannelRowProps) {
  const channel = useAppStore((s) =>
    s.channels.find((c) => c.id === channelId),
  );
  const { loadSample, removeSample, removeChannel, duplicateChannel, toggleMute, toggleSolo } =
    useAppStore();

  if (!channel) return null;
  const { isRecording, startRecording, stopRecording } = useRecorder();

  const handleRecord = async () => {
    if (isRecording) {
      const sample = await stopRecording();
      if (sample) {
        loadSample(channelId, sample);
      }
    } else {
      await startRecording();
    }
  };

  const handleUpload = async () => {
    try {
      const file = await pickAudioFile();
      if (!file) return;

      const durationMs = await getAudioDuration(file.uri);
      const sample = createSampleFromFile(file.uri, file.name, durationMs);
      loadSample(channelId, sample);
    } catch (err) {
      console.error("Upload failed:", err);
      if (Platform.OS === "web") {
        alert("Could not load the audio file.");
      } else {
        Alert.alert("Upload Failed", "Could not load the audio file.");
      }
    }
  };

  const handleTapSample = () => {
    if (channel.sample) {
      const trigger = triggerRef.current.get(channelId);
      if (trigger) trigger();
    }
  };

  const handleLongPress = () => {
    if (channel.sample) {
      if (Platform.OS === "web") {
        const action = window.prompt(
          `Sample: ${channel.sample.name}\nType "edit" to edit or "remove" to remove:`,
        );
        if (action === "edit") onEditSample(channelId);
        else if (action === "remove") removeSample(channelId);
      } else {
        Alert.alert("Sample Options", channel.sample.name, [
          { text: "Edit", onPress: () => onEditSample(channelId) },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => removeSample(channelId),
          },
          { text: "Cancel", style: "cancel" },
        ]);
      }
    }
  };

  return (
    <View style={[styles.container, channel.muted && styles.muted]}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{channel.label}</Text>
          <View style={styles.controls}>
            <TouchableOpacity
              style={[
                styles.controlBtn,
                channel.muted && styles.controlBtnActive,
              ]}
              onPress={() => toggleMute(channelId)}
            >
              <Text style={styles.controlText}>M</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, channel.solo && styles.soloBtnActive]}
              onPress={() => toggleSolo(channelId)}
            >
              <Text style={styles.controlText}>S</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, styles.dupeBtn]}
              onPress={() => duplicateChannel(channelId)}
            >
              <Text style={styles.controlText}>⧉</Text>
            </TouchableOpacity>
            {canRemove && (
              <TouchableOpacity
                style={[styles.controlBtn, styles.removeBtn]}
                onPress={() => removeChannel(channelId)}
              >
                <Text style={styles.controlText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <SequencerGrid channelId={channelId} />
      <TripletGrid channelId={channelId} />
      <View style={styles.sampleRow}>
        {channel.sample ? (
          <View style={styles.sampleSlotRow}>
            <TouchableOpacity
              style={styles.sampleSlot}
              onPress={handleTapSample}
            >
              <Text style={styles.sampleName} numberOfLines={1}>
                {channel.sample.name}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onEditSample(channelId)}
            >
              <Text style={styles.editBtnText}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => removeSample(channelId)}
            >
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionBtn, isRecording && styles.recordingBtn]}
              onPress={handleRecord}
            >
              <Text style={styles.actionBtnText}>
                {isRecording ? "■ Stop" : "● Rec"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleUpload}>
              <Text style={styles.actionBtnText}>↑ Load</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
    gap: 8,
  },
  muted: {
    opacity: 0.5,
  },
  header: {
    width: 200,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: {
    color: colors.mint,
    fontSize: 16,
    fontWeight: "700",
    marginRight: 8,
  },
  controls: {
    flexDirection: "row",
    gap: 8,
  },
  controlBtn: {
    width: 32,
    height: 32,
    borderRadius: 3,
    backgroundColor: colors.pine,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnActive: {
    backgroundColor: colors.warning,
  },
  soloBtnActive: {
    backgroundColor: colors.sage,
  },
  controlText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "800",
  },
  sampleRow: {
    minHeight: 28,
  },
  sampleSlotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 50,
    width: 200,
  },
  sampleSlot: {
    flex: 1,
    backgroundColor: colors.pine,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    height: 50,
    width: 200,
    justifyContent: "center",
    alignContent: "center",
  },
  sampleName: {
    color: colors.dew,
    fontSize: 14,
  },
  iconBtn: {
    padding: 6,
  },
  editBtnText: {
    color: colors.sage,
    fontSize: 24,
  },
  deleteBtnText: {
    color: colors.recording,
    fontSize: 24,
    fontWeight: "700",
  },
  dupeBtn: {
    backgroundColor: colors.fern,
  },
  removeBtn: {
    backgroundColor: colors.recording,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 4,
  },
  actionBtn: {
    backgroundColor: colors.pine,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    width: 100,
    alignItems: "center",
    justifyContent: "center",
    height: 50,
  },
  recordingBtn: {
    backgroundColor: colors.recording,
  },
  actionBtnText: {
    color: colors.dew,
    fontSize: 16,
    fontWeight: "600",
  },
});
