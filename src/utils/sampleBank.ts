/**
 * Sample Bank — persistent storage for reusable samples.
 *
 * Native: copies audio files to a dedicated bank directory on disk.
 * Web: converts blob URLs to base64 data URIs so they survive across sessions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Sample } from '../types';

const BANK_KEY = '@sample_bank';

export interface BankEntry {
  /** Stored sample metadata */
  sample: Sample;
  /** When it was saved */
  savedAt: number;
  /** Optional user-defined tags */
  tags: string[];
}

/** Load all bank entries from storage. */
export async function loadBank(): Promise<BankEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BANK_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as BankEntry[];

    // On web, convert stored data URIs back to blob URLs for playback
    if (Platform.OS === 'web') {
      for (const entry of entries) {
        if (entry.sample.uri.startsWith('data:')) {
          entry.sample.uri = dataUriToBlobUrl(entry.sample.uri);
        }
      }
    }

    return entries;
  } catch (err) {
    console.error('Failed to load sample bank:', err);
    return [];
  }
}

/** Save the full bank back to storage. */
async function saveBank(entries: BankEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(BANK_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error('Failed to save sample bank:', err);
  }
}

/**
 * Save a sample to the bank.
 * Native: copies audio file to persistent bank directory.
 * Web: fetches blob URL contents and stores as base64 data URI.
 */
export async function saveSampleToBank(
  sample: Sample,
  tags: string[] = [],
): Promise<void> {
  let persistedSample = { ...sample };

  if (Platform.OS === 'web') {
    // Convert blob/object URL to a data URI so it persists in AsyncStorage
    try {
      persistedSample.uri = await blobUrlToDataUri(sample.uri);
    } catch (err) {
      console.error('Failed to convert sample to data URI:', err);
    }
  } else {
    // Native: copy the file to a dedicated bank directory
    try {
      const { Paths, Directory, File } = await import('expo-file-system');
      const bankDir = new Directory(Paths.document, 'sample-bank');
      if (!bankDir.exists) bankDir.create();

      const ext = sample.uri.split('.').pop() || 'wav';
      const destFile = new File(bankDir, `${sample.id}.${ext}`);
      if (!destFile.exists) {
        const srcFile = new File(sample.uri);
        if (srcFile.exists) {
          srcFile.copy(destFile);
        }
      }
      persistedSample.uri = destFile.uri;
    } catch (err) {
      console.error('Failed to copy sample file to bank:', err);
    }
  }

  const entries = await loadBank();

  // For storage, on web convert any blob URIs back to data URIs
  const storageEntries = Platform.OS === 'web'
    ? entries.map((e) => ({
        ...e,
        sample: {
          ...e.sample,
          // Keep existing data URIs as-is; blob URLs from loadBank are transient
          uri: e.sample.uri.startsWith('blob:')
            ? (e as any)._dataUri ?? e.sample.uri
            : e.sample.uri,
        },
      }))
    : entries;

  // Don't duplicate — replace if same id exists
  const idx = storageEntries.findIndex((e) => e.sample.id === sample.id);
  const entry: BankEntry = {
    sample: persistedSample,
    savedAt: Date.now(),
    tags,
  };

  if (idx >= 0) {
    storageEntries[idx] = entry;
  } else {
    storageEntries.push(entry);
  }

  await saveBank(storageEntries);
}

/** Remove a sample from the bank by id. Also deletes the banked file on native. */
export async function removeSampleFromBank(sampleId: string): Promise<void> {
  const entries = await loadBank();
  const entry = entries.find((e) => e.sample.id === sampleId);

  // Delete banked file on native
  if (entry && Platform.OS !== 'web') {
    try {
      const { File } = await import('expo-file-system');
      const file = new File(entry.sample.uri);
      if (file.exists) file.delete();
    } catch {}
  }

  // Revoke blob URL on web
  if (entry && Platform.OS === 'web' && entry.sample.uri.startsWith('blob:')) {
    try { URL.revokeObjectURL(entry.sample.uri); } catch {}
  }

  // Re-read raw storage to get data URIs (not blob URLs)
  const raw = await AsyncStorage.getItem(BANK_KEY);
  const rawEntries: BankEntry[] = raw ? JSON.parse(raw) : [];
  const filtered = rawEntries.filter((e) => e.sample.id !== sampleId);
  await saveBank(filtered);
}

/** Check if a sample is already in the bank. */
export async function isSampleInBank(sampleId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(BANK_KEY);
  if (!raw) return false;
  const entries = JSON.parse(raw) as BankEntry[];
  return entries.some((e) => e.sample.id === sampleId);
}

/** Fetch a blob/object URL and convert to a base64 data URI. */
async function blobUrlToDataUri(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert a base64 data URI back to a blob URL for Web Audio playback. */
function dataUriToBlobUrl(dataUri: string): string {
  const [header, b64] = dataUri.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'audio/wav';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}
