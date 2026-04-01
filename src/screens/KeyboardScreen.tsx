import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  GestureResponderEvent,
} from 'react-native';
import { colors } from '../theme/colors';
import { useAppStore } from '../state/useAppStore';
import { webAudioEngine } from '../audio/webAudioEngine';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_INDICES = new Set([1, 3, 6, 8, 10]);
const BASE_OCTAVE = 3;

interface NoteInfo {
  index: number;
  name: string;
  semitones: number;
  isBlack: boolean;
}

function buildNotes(numOctaves: number): NoteInfo[] {
  const total = numOctaves * 12;
  return Array.from({ length: total }, (_, i) => {
    const octave = BASE_OCTAVE + Math.floor(i / 12);
    const noteIdx = i % 12;
    return {
      index: i,
      name: `${NOTE_NAMES[noteIdx]}${octave}`,
      semitones: i - 12, // C4 = 0
      isBlack: BLACK_INDICES.has(noteIdx),
    };
  });
}

// QWERTY mapping — covers up to 3 octaves (36 notes)
const QWERTY_KEYS = [
  'a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j',
  'k', 'o', 'l', 'p', ';', "'",
  'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/',
  '1', '2', '3', '4', '5', '6', '7', '8',
];

function buildQwertyMap(totalNotes: number): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < Math.min(totalNotes, QWERTY_KEYS.length); i++) {
    map[QWERTY_KEYS[i]] = i;
  }
  return map;
}

/** Find the white key index that a black key sits to the right of */
function getWhiteIndexForBlack(noteIndex: number): number {
  let count = 0;
  for (let i = 0; i < noteIndex; i++) {
    if (!BLACK_INDICES.has(i % 12)) count++;
  }
  return count - 1;
}

export interface MidiNoteEvent {
  note: number;
  noteName: string;
  startMs: number;
  endMs: number;
  velocity: number;
}

interface KeyboardScreenProps {
  channelId: number;
  onClose: () => void;
}

export function KeyboardScreen({ channelId, onClose }: KeyboardScreenProps) {
  const channel = useAppStore((s) => s.channels.find((c) => c.id === channelId));
  const sample = channel?.sample;

  const [numOctaves, setNumOctaves] = useState(2);

  const notes = useMemo(() => buildNotes(numOctaves), [numOctaves]);
  const whiteNotes = useMemo(() => notes.filter((n) => !n.isBlack), [notes]);
  const blackNotes = useMemo(() => notes.filter((n) => n.isBlack), [notes]);
  const qwertyMap = useMemo(() => buildQwertyMap(notes.length), [notes.length]);

  // Active notes: map of note index → stop function
  const activeNotesRef = useRef<Map<number, () => void>>(new Map());
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());

  // Multi-touch: track which finger (identifier) → which note index
  const touchNoteMap = useRef<Map<number, number>>(new Map());

  // MIDI recording
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [midiEvents, setMidiEvents] = useState<MidiNoteEvent[]>([]);
  const recordingStartRef = useRef<number>(0);
  const pendingNotesRef = useRef<Map<number, { startMs: number; noteName: string }>>(new Map());

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // Layout
  const keyboardRef = useRef<View>(null);
  const keyboardLayoutRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Stable refs
  const sampleRef = useRef(sample);
  const channelRef = useRef(channel);
  const notesRef = useRef(notes);
  const whiteNotesRef = useRef(whiteNotes);
  const blackNotesRef = useRef(blackNotes);
  useEffect(() => { sampleRef.current = sample; }, [sample]);
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { whiteNotesRef.current = whiteNotes; }, [whiteNotes]);
  useEffect(() => { blackNotesRef.current = blackNotes; }, [blackNotes]);

  const getNoteAtPosition = useCallback((pageX: number, pageY: number): NoteInfo | null => {
    const layout = keyboardLayoutRef.current;
    if (layout.width === 0) return null;

    const relX = pageX - layout.x;
    const relY = pageY - layout.y;

    if (relX < 0 || relX > layout.width || relY < 0 || relY > layout.height) {
      return null;
    }

    const wNotes = whiteNotesRef.current;
    const bNotes = blackNotesRef.current;
    const whiteKeyWidth = layout.width / wNotes.length;
    const blackKeyHeight = layout.height * 0.6;

    if (relY < blackKeyHeight) {
      for (const note of bNotes) {
        const whiteIndex = getWhiteIndexForBlack(note.index);
        const blackX = (whiteIndex + 1) * whiteKeyWidth - whiteKeyWidth * 0.3;
        const blackW = whiteKeyWidth * 0.6;
        if (relX >= blackX && relX <= blackX + blackW) {
          return note;
        }
      }
    }

    const whiteIdx = Math.floor(relX / whiteKeyWidth);
    if (whiteIdx >= 0 && whiteIdx < wNotes.length) {
      return wNotes[whiteIdx];
    }

    return null;
  }, []);

  const noteOn = useCallback((noteIndex: number) => {
    const s = sampleRef.current;
    const ch = channelRef.current;
    const allNotes = notesRef.current;
    if (!s || noteIndex < 0 || noteIndex >= allNotes.length) return;
    if (activeNotesRef.current.has(noteIndex)) return;

    const note = allNotes[noteIndex];
    const stop = webAudioEngine.playNote(
      s.id,
      note.semitones,
      s.volume * (ch?.volume ?? 1),
      s.trimStartMs,
      s.trimEndMs,
      s.durationMs,
    );

    if (stop) {
      activeNotesRef.current.set(noteIndex, stop);
      setActiveKeys((prev) => new Set(prev).add(noteIndex));
    }

    if (isRecordingRef.current) {
      const now = performance.now() - recordingStartRef.current;
      pendingNotesRef.current.set(noteIndex, { startMs: now, noteName: note.name });
    }
  }, []);

  const noteOff = useCallback((noteIndex: number) => {
    const stop = activeNotesRef.current.get(noteIndex);
    if (stop) {
      stop();
      activeNotesRef.current.delete(noteIndex);
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(noteIndex);
        return next;
      });
    }

    if (isRecordingRef.current) {
      const pending = pendingNotesRef.current.get(noteIndex);
      if (pending) {
        const now = performance.now() - recordingStartRef.current;
        const noteInfo = notesRef.current[noteIndex];
        if (noteInfo) {
          setMidiEvents((prev) => [...prev, {
            note: noteInfo.semitones,
            noteName: pending.noteName,
            startMs: pending.startMs,
            endMs: now,
            velocity: 1,
          }]);
        }
        pendingNotesRef.current.delete(noteIndex);
      }
    }
  }, []);

  // --- Multi-touch handlers ---
  const handleTouchEvent = useCallback((evt: GestureResponderEvent, type: 'start' | 'move' | 'end') => {
    const touches = evt.nativeEvent.changedTouches || [evt.nativeEvent];

    for (const touch of touches) {
      const { identifier, pageX, pageY } = touch as any;
      const id = identifier ?? 0;

      if (type === 'end') {
        const prevNote = touchNoteMap.current.get(id);
        if (prevNote !== undefined) {
          noteOff(prevNote);
          touchNoteMap.current.delete(id);
        }
        continue;
      }

      const note = getNoteAtPosition(pageX, pageY);
      const prevNote = touchNoteMap.current.get(id);

      if (note) {
        if (prevNote !== note.index) {
          if (prevNote !== undefined) noteOff(prevNote);
          touchNoteMap.current.set(id, note.index);
          noteOn(note.index);
        }
      } else {
        if (prevNote !== undefined) {
          noteOff(prevNote);
          touchNoteMap.current.delete(id);
        }
      }
    }
  }, [getNoteAtPosition, noteOn, noteOff]);

  // QWERTY keyboard input (web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const heldKeys = new Set<string>();
    const currentMap = qwertyMap;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (heldKeys.has(key)) return;
      const noteIndex = currentMap[key];
      if (noteIndex !== undefined) {
        e.preventDefault();
        heldKeys.add(key);
        noteOn(noteIndex);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      heldKeys.delete(key);
      const noteIndex = currentMap[key];
      if (noteIndex !== undefined) {
        e.preventDefault();
        noteOff(noteIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [noteOn, noteOff, qwertyMap]);

  // Stop all notes when octave changes
  useEffect(() => {
    activeNotesRef.current.forEach((stop) => stop());
    activeNotesRef.current.clear();
    touchNoteMap.current.clear();
    setActiveKeys(new Set());
  }, [numOctaves]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeNotesRef.current.forEach((stop) => stop());
    };
  }, []);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      pendingNotesRef.current.forEach((pending, noteIndex) => {
        const now = performance.now() - recordingStartRef.current;
        const noteInfo = notesRef.current[noteIndex];
        if (noteInfo) {
          setMidiEvents((prev) => [...prev, {
            note: noteInfo.semitones,
            noteName: pending.noteName,
            startMs: pending.startMs,
            endMs: now,
            velocity: 1,
          }]);
        }
      });
      pendingNotesRef.current.clear();
      setIsRecording(false);
    } else {
      setMidiEvents([]);
      recordingStartRef.current = performance.now();
      setIsRecording(true);
    }
  }, [isRecording]);

  const handleExportMidi = useCallback(() => {
    if (midiEvents.length === 0) {
      const msg = 'No notes recorded yet.';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Export', msg);
      return;
    }

    const midiData = exportMidiFile(midiEvents);
    if (Platform.OS === 'web') {
      const blob = new Blob([midiData.buffer as ArrayBuffer], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keyboard_${Date.now()}.mid`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const msg = `Recorded ${midiEvents.length} notes. MIDI export saved.`;
      Alert.alert('MIDI Exported', msg);
    }
  }, [midiEvents]);

  if (!sample) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.backButton}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Keyboard</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Load a sample first to play it on the keyboard.</Text>
        </View>
      </View>
    );
  }

  // QWERTY labels
  const qwertyLabels: Record<number, string> = {};
  if (Platform.OS === 'web') {
    for (const [key, idx] of Object.entries(qwertyMap)) {
      qwertyLabels[idx] = key === ';' ? ';' : key === "'" ? "'" : key.toUpperCase();
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backButton}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Keyboard</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Sample info */}
      <View style={styles.sampleInfo}>
        <Text style={styles.sampleName} numberOfLines={1}>{sample.name}</Text>
        <Text style={styles.hint}>
          {Platform.OS === 'web'
            ? 'Touch or slide to play. Use QWERTY keys on desktop.'
            : 'Touch and slide across keys to play'}
        </Text>
      </View>

      {/* Octave selector + MIDI controls */}
      <View style={styles.controlBar}>
        <View style={styles.octaveSelector}>
          {[1, 2, 3].map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.octaveBtn, numOctaves === n && styles.octaveBtnActive]}
              onPress={() => setNumOctaves(n)}
            >
              <Text style={[styles.octaveBtnText, numOctaves === n && styles.octaveBtnTextActive]}>
                {n} Oct
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.midiBtn, isRecording && styles.midiBtnRecording]}
          onPress={handleToggleRecording}
        >
          <Text style={[styles.midiBtnText, isRecording && styles.midiBtnTextRecording]}>
            {isRecording ? 'Stop' : 'Rec'}
          </Text>
        </TouchableOpacity>

        {midiEvents.length > 0 && !isRecording && (
          <TouchableOpacity style={styles.exportBtn} onPress={handleExportMidi}>
            <Text style={styles.exportBtnText}>{midiEvents.length} notes — Export</Text>
          </TouchableOpacity>
        )}

        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
          </View>
        )}
      </View>

      {/* Piano keyboard — raw touch events for multi-touch */}
      <View
        ref={keyboardRef}
        style={styles.keyboard}
        onLayout={() => {
          if (keyboardRef.current) {
            (keyboardRef.current as any).measureInWindow?.(
              (x: number, y: number, w: number, h: number) => {
                keyboardLayoutRef.current = { x, y, width: w, height: h };
              }
            );
          }
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => handleTouchEvent(e, 'start')}
        onResponderMove={(e) => handleTouchEvent(e, 'move')}
        onResponderRelease={(e) => handleTouchEvent(e, 'end')}
        onResponderTerminate={(e) => handleTouchEvent(e, 'end')}
      >
        {/* White keys */}
        <View style={styles.whiteKeysRow} pointerEvents="none">
          {whiteNotes.map((note) => (
            <View
              key={note.index}
              style={[
                styles.whiteKey,
                activeKeys.has(note.index) && styles.whiteKeyActive,
              ]}
            >
              {qwertyLabels[note.index] !== undefined && (
                <Text style={[styles.qwertyLabel, activeKeys.has(note.index) && styles.qwertyLabelActive]}>
                  {qwertyLabels[note.index]}
                </Text>
              )}
              <Text style={[
                styles.whiteKeyLabel,
                activeKeys.has(note.index) && styles.keyLabelActive,
              ]}>
                {note.name}
              </Text>
            </View>
          ))}
        </View>

        {/* Black keys */}
        {blackNotes.map((note) => {
          const whiteIndex = getWhiteIndexForBlack(note.index);
          const whiteKeyPercent = 100 / whiteNotes.length;
          const leftPercent = (whiteIndex + 1) * whiteKeyPercent - whiteKeyPercent * 0.3;
          const widthPercent = whiteKeyPercent * 0.6;

          return (
            <View
              key={note.index}
              pointerEvents="none"
              style={[
                styles.blackKey,
                {
                  left: `${leftPercent}%` as any,
                  width: `${widthPercent}%` as any,
                },
                activeKeys.has(note.index) && styles.blackKeyActive,
              ]}
            >
              {qwertyLabels[note.index] !== undefined && (
                <Text style={styles.blackQwertyLabel}>
                  {qwertyLabels[note.index]}
                </Text>
              )}
              <Text style={styles.blackKeyLabel}>{NOTE_NAMES[note.index % 12]}</Text>
            </View>
          );
        })}
      </View>

      {/* Recorded notes list */}
      {midiEvents.length > 0 && !isRecording && (
        <ScrollView style={styles.eventList}>
          <Text style={styles.sectionTitle}>Recorded Notes</Text>
          {midiEvents.map((evt, i) => (
            <View key={i} style={styles.eventRow}>
              <Text style={styles.eventNote}>{evt.noteName}</Text>
              <Text style={styles.eventTime}>
                {(evt.startMs / 1000).toFixed(2)}s – {(evt.endMs / 1000).toFixed(2)}s
              </Text>
              <Text style={styles.eventDuration}>
                {(evt.endMs - evt.startMs).toFixed(0)}ms
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── MIDI export ──

function exportMidiFile(events: MidiNoteEvent[]): Uint8Array {
  const TICKS_PER_QUARTER = 480;
  const BPM = 120;
  const MS_PER_TICK = (60000 / BPM) / TICKS_PER_QUARTER;

  type TrackEvent = { tickTime: number; data: number[] };
  const trackEvents: TrackEvent[] = [];
  const MIDI_C4 = 60;

  for (const evt of events) {
    const midiNote = MIDI_C4 + evt.note;
    const velocity = Math.round(evt.velocity * 127);
    const onTick = Math.round(evt.startMs / MS_PER_TICK);
    const offTick = Math.round(evt.endMs / MS_PER_TICK);
    trackEvents.push(
      { tickTime: onTick, data: [0x90, midiNote, velocity] },
      { tickTime: offTick, data: [0x80, midiNote, 0] },
    );
  }

  trackEvents.sort((a, b) => a.tickTime - b.tickTime);

  const trackBytes: number[] = [];
  const microsecondsPerBeat = Math.round(60000000 / BPM);
  trackBytes.push(0x00, 0xFF, 0x51, 0x03);
  trackBytes.push((microsecondsPerBeat >> 16) & 0xFF);
  trackBytes.push((microsecondsPerBeat >> 8) & 0xFF);
  trackBytes.push(microsecondsPerBeat & 0xFF);

  let lastTick = 0;
  for (const evt of trackEvents) {
    const delta = evt.tickTime - lastTick;
    lastTick = evt.tickTime;
    writeVarLen(trackBytes, delta);
    trackBytes.push(...evt.data);
  }

  trackBytes.push(0x00, 0xFF, 0x2F, 0x00);

  const header = [
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01,
    (TICKS_PER_QUARTER >> 8) & 0xFF, TICKS_PER_QUARTER & 0xFF,
  ];

  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B,
    (trackBytes.length >> 24) & 0xFF,
    (trackBytes.length >> 16) & 0xFF,
    (trackBytes.length >> 8) & 0xFF,
    trackBytes.length & 0xFF,
  ];

  return new Uint8Array([...header, ...trackHeader, ...trackBytes]);
}

function writeVarLen(out: number[], value: number) {
  if (value < 0) value = 0;
  const bytes: number[] = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  bytes.reverse();
  out.push(...bytes);
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
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
  sampleInfo: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sampleName: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  hint: {
    color: colors.stone,
    fontSize: 11,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  octaveSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  octaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.fern,
  },
  octaveBtnActive: {
    backgroundColor: colors.fern,
    borderColor: colors.fern,
  },
  octaveBtnText: {
    color: colors.fern,
    fontSize: 12,
    fontWeight: '700',
  },
  octaveBtnTextActive: {
    color: colors.white,
  },
  midiBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.sage,
    marginLeft: 'auto' as any,
  },
  midiBtnRecording: {
    backgroundColor: colors.recording,
    borderColor: colors.recording,
  },
  midiBtnText: {
    color: colors.sage,
    fontSize: 12,
    fontWeight: '700',
  },
  midiBtnTextRecording: {
    color: colors.white,
  },
  exportBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.fern,
  },
  exportBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  recordingIndicator: {
    justifyContent: 'center',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.recording,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    color: colors.stone,
    fontSize: 14,
    textAlign: 'center',
  },
  keyboard: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 8,
    position: 'relative',
    minHeight: 220,
  },
  whiteKeysRow: {
    flex: 1,
    flexDirection: 'row',
  },
  whiteKey: {
    flex: 1,
    backgroundColor: colors.dew,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.stone,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
  },
  whiteKeyActive: {
    backgroundColor: colors.sage,
  },
  whiteKeyLabel: {
    color: colors.forest,
    fontSize: 9,
    fontWeight: '600',
  },
  keyLabelActive: {
    color: colors.white,
  },
  qwertyLabel: {
    color: colors.stone,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  qwertyLabelActive: {
    color: colors.white,
  },
  blackKey: {
    position: 'absolute',
    top: 0,
    height: '60%',
    backgroundColor: colors.bark,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
    zIndex: 1,
  },
  blackKeyActive: {
    backgroundColor: colors.fern,
  },
  blackKeyLabel: {
    color: colors.cloud,
    fontSize: 8,
    fontWeight: '600',
  },
  blackQwertyLabel: {
    color: colors.seafoam,
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 1,
  },
  sectionTitle: {
    color: colors.dew,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  eventList: {
    maxHeight: 140,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  eventRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.pine,
  },
  eventNote: {
    color: colors.sage,
    fontSize: 12,
    fontWeight: '700',
    width: 40,
  },
  eventTime: {
    color: colors.seafoam,
    fontSize: 12,
    flex: 1,
  },
  eventDuration: {
    color: colors.stone,
    fontSize: 12,
    width: 60,
    textAlign: 'right',
  },
});
