import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Sample } from "../types";
import { isNativeAvailable } from "../../modules/audio-engine";

// On web we use blob URLs, on native we use expo-file-system
async function saveSampleFileNative(
  sourceUri: string,
  name: string,
): Promise<string> {
  const { Paths, Directory, File } = await import("expo-file-system");
  const samplesDir = new Directory(Paths.document, "samples");
  if (!samplesDir.exists) {
    samplesDir.create();
  }
  const sourceFile = new File(sourceUri);
  const destFile = new File(samplesDir, `${Date.now()}_${name}`);
  sourceFile.copy(destFile);
  return destFile.uri;
}

export async function saveSampleFile(
  sourceUri: string,
  name: string,
): Promise<string> {
  if (Platform.OS === "web") {
    // On web, blob URLs are already usable directly
    return sourceUri;
  }
  return saveSampleFileNative(sourceUri, name);
}

export async function deleteSampleFile(uri: string): Promise<void> {
  if (Platform.OS === "web") {
    // Revoke blob URL if it is one
    try {
      if (uri.startsWith("blob:")) {
        URL.revokeObjectURL(uri);
      }
    } catch {}
    return;
  }
  try {
    const { File } = await import("expo-file-system");
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {}
}

export async function pickAudioFile(): Promise<{
  uri: string;
  name: string;
  durationMs?: number;
  waveformData?: number[];
} | null> {
  if (Platform.OS === "web") {
    // Use a file input on web
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept =
        ".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const uri = URL.createObjectURL(file);
        resolve({ uri, name: file.name });
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];

  // Native: use AudioEngine for accurate duration & waveform
  if (isNativeAvailable) {
    try {
      const AudioEngine = require("../../modules/audio-engine");
      const importResult = await AudioEngine.importAudioFile(
        asset.uri,
        asset.name,
      );
      return {
        uri: importResult.uri,
        name: asset.name,
        durationMs: importResult.durationMs,
        waveformData: importResult.waveformData,
      };
    } catch (err) {
      console.error("Native import failed, falling back:", err);
    }
  }

  const savedUri = await saveSampleFile(asset.uri, asset.name);
  return { uri: savedUri, name: asset.name };
}

export function generateWaveformData(length: number = 50): number[] {
  return Array.from({ length }, () => 0.2 + Math.random() * 0.8);
}

export function createSampleFromRecording(
  uri: string,
  durationMs: number,
  name?: string,
): Sample {
  return {
    id: `sample_${Date.now()}`,
    uri,
    name: name || `Recording ${new Date().toLocaleTimeString()}`,
    durationMs,
    trimStartMs: 0,
    trimEndMs: durationMs,
    playbackRate: 1.0,
    preservePitch: true,
    volume: 1.0,
    waveformData: generateWaveformData(),
  };
}

export function createSampleFromFile(
  uri: string,
  name: string,
  durationMs: number,
  waveformData?: number[],
): Sample {
  return {
    id: `sample_${Date.now()}`,
    uri,
    name,
    durationMs,
    trimStartMs: 0,
    trimEndMs: durationMs,
    playbackRate: 1.0,
    preservePitch: true,
    volume: 1.0,
    waveformData: waveformData ?? generateWaveformData(),
  };
}
