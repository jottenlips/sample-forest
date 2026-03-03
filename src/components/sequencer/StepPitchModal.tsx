import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useAppStore } from '../../state/useAppStore';

// ── Scale definitions (intervals from root) ─────────────────────────

const SCALES: Record<string, number[]> = {
  Chromatic:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Major:        [0, 2, 4, 5, 7, 9, 11],
  Minor:        [0, 2, 3, 5, 7, 8, 10],
  'Penta Maj':  [0, 2, 4, 7, 9],
  'Penta Min':  [0, 3, 5, 7, 10],
  Blues:         [0, 3, 5, 6, 7, 10],
  Dorian:       [0, 2, 3, 5, 7, 9, 10],
  Mixolydian:   [0, 2, 4, 5, 7, 9, 10],
  'Harm Min':   [0, 2, 3, 5, 7, 8, 11],
};

const SCALE_NAMES = Object.keys(SCALES);

// ── Piano key helpers ────────────────────────────────────────────────

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function isBlackKey(semitone: number): boolean {
  return BLACK_KEYS.has(((semitone % 12) + 12) % 12);
}

function noteName(semitone: number): string {
  return NOTE_NAMES[((semitone % 12) + 12) % 12];
}

function isInScale(semitone: number, scaleIntervals: number[]): boolean {
  const normalized = ((semitone % 12) + 12) % 12;
  return scaleIntervals.includes(normalized);
}

const ALL_SEMITONES: number[] = [];
for (let i = 12; i >= -12; i--) ALL_SEMITONES.push(i);

const KEY_HEIGHT = 29; // height + margin per key row
const PIANO_SCROLL_STEP = KEY_HEIGHT * 5;
const SCALE_SCROLL_STEP = 120;

// ── Component ────────────────────────────────────────────────────────

export const StepPitchModal = React.memo(function StepPitchModal() {
  const target = useAppStore((s) => s.pitchEditTarget);
  const closePitchEdit = useAppStore((s) => s.closePitchEdit);
  const setStepPitch = useAppStore((s) => s.setStepPitch);
  const setTripletStepPitch = useAppStore((s) => s.setTripletStepPitch);
  const selectedScale = useAppStore((s) => s.selectedScale);
  const setScale = useAppStore((s) => s.setScale);

  const pianoScrollRef = useRef<ScrollView>(null);
  const scaleScrollRef = useRef<ScrollView>(null);
  const pianoOffsetRef = useRef(0);
  const scaleOffsetRef = useRef(0);

  const currentPitch = useAppStore((s) => {
    if (!s.pitchEditTarget) return 0;
    const ch = s.channels.find((c) => c.id === s.pitchEditTarget!.channelId);
    if (!ch) return 0;
    if (s.pitchEditTarget!.isTriplet) {
      return ch.tripletStepPitches?.[s.pitchEditTarget!.stepIndex] ?? 0;
    }
    return ch.stepPitches?.[s.pitchEditTarget!.stepIndex] ?? 0;
  });

  if (!target) return null;

  const scaleIntervals = SCALES[selectedScale] ?? SCALES.Chromatic;

  const handleSelect = (semitones: number) => {
    if (target.isTriplet) {
      setTripletStepPitch(target.channelId, target.stepIndex, semitones);
    } else {
      setStepPitch(target.channelId, target.stepIndex, semitones);
    }
    closePitchEdit();
  };

  const scrollPiano = (direction: -1 | 1) => {
    const y = Math.max(0, pianoOffsetRef.current + direction * PIANO_SCROLL_STEP);
    pianoOffsetRef.current = y;
    pianoScrollRef.current?.scrollTo({ y, animated: true });
  };

  const scrollScales = (direction: -1 | 1) => {
    const x = Math.max(0, scaleOffsetRef.current + direction * SCALE_SCROLL_STEP);
    scaleOffsetRef.current = x;
    scaleScrollRef.current?.scrollTo({ x, animated: true });
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={closePitchEdit}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closePitchEdit} />

        <View style={styles.container}>
          {/* Header */}
          <Text style={styles.title}>
            Step {target.stepIndex + 1} Pitch
          </Text>
          <Text style={styles.subtitle}>
            {currentPitch === 0
              ? 'No pitch shift'
              : `${currentPitch > 0 ? '+' : ''}${currentPitch} st (${noteName(currentPitch)})`}
          </Text>

          {/* Scale picker with arrows */}
          <View style={styles.scaleWrapper}>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => scrollScales(-1)}
            >
              <Text style={styles.arrowText}>{'\u25C0'}</Text>
            </TouchableOpacity>
            <ScrollView
              ref={scaleScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scaleRow}
              style={styles.scaleScroll}
              onScroll={(e) => { scaleOffsetRef.current = e.nativeEvent.contentOffset.x; }}
              scrollEventThrottle={32}
            >
              {SCALE_NAMES.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.scaleBtn,
                    selectedScale === name && styles.scaleBtnActive,
                  ]}
                  onPress={() => setScale(name)}
                >
                  <Text
                    style={[
                      styles.scaleBtnText,
                      selectedScale === name && styles.scaleBtnTextActive,
                    ]}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => scrollScales(1)}
            >
              <Text style={styles.arrowText}>{'\u25B6'}</Text>
            </TouchableOpacity>
          </View>

          {/* Piano roll with arrows */}
          <TouchableOpacity
            style={styles.arrowBtnWide}
            onPress={() => scrollPiano(-1)}
          >
            <Text style={styles.arrowText}>{'\u25B2'} Higher</Text>
          </TouchableOpacity>

          <ScrollView
            ref={pianoScrollRef}
            style={styles.pianoScroll}
            contentContainerStyle={styles.pianoContent}
            showsVerticalScrollIndicator={false}
            contentOffset={{ x: 0, y: 12 * KEY_HEIGHT - 100 }}
            onScroll={(e) => { pianoOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={32}
          >
            {ALL_SEMITONES.filter((semi) => isInScale(semi, scaleIntervals)).map((semi) => {
              const black = isBlackKey(semi);
              const isSelected = semi === currentPitch;
              const isRoot = semi === 0;

              return (
                <TouchableOpacity
                  key={semi}
                  style={[
                    styles.pianoKey,
                    black ? styles.blackKey : styles.whiteKey,
                    isSelected && styles.keySelected,
                    isRoot && !isSelected && styles.keyRoot,
                  ]}
                  onPress={() => handleSelect(semi)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.keyOffset,
                      black && styles.keyOffsetBlack,
                      isSelected && styles.keyOffsetSelected,
                    ]}
                  >
                    {semi > 0 ? '+' : ''}{semi}
                  </Text>

                  <View
                    style={[
                      styles.keyBody,
                      black ? styles.blackKeyBody : styles.whiteKeyBody,
                      isSelected && styles.keyBodySelected,
                      isRoot && !isSelected && styles.keyBodyRoot,
                    ]}
                  />

                  <Text
                    style={[
                      styles.keyName,
                      black && styles.keyNameBlack,
                      isSelected && styles.keyNameSelected,
                    ]}
                  >
                    {noteName(semi)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.arrowBtnWide}
            onPress={() => scrollPiano(1)}
          >
            <Text style={styles.arrowText}>{'\u25BC'} Lower</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: colors.forest,
    borderRadius: 12,
    padding: 16,
    width: 300,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.pine,
  },
  title: {
    color: colors.dew,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitle: {
    color: colors.mint,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },

  // ── Arrows ──────────────────────────────────────────────
  arrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnWide: {
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  arrowText: {
    color: colors.mint,
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Scale picker ──────────────────────────────────────
  scaleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  scaleScroll: {
    flex: 1,
    maxHeight: 32,
  },
  scaleRow: {
    gap: 6,
    paddingHorizontal: 2,
  },
  scaleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.pine,
  },
  scaleBtnActive: {
    backgroundColor: colors.sage,
  },
  scaleBtnText: {
    color: colors.mist,
    fontSize: 11,
    fontWeight: '600',
  },
  scaleBtnTextActive: {
    color: colors.forest,
    fontWeight: '700',
  },

  // ── Piano roll ────────────────────────────────────────
  pianoScroll: {
    flexGrow: 0,
  },
  pianoContent: {
    paddingVertical: 2,
  },
  pianoKey: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    marginVertical: 0.5,
    borderRadius: 3,
    paddingHorizontal: 8,
  },
  whiteKey: {
    backgroundColor: '#1E3D2E',
  },
  blackKey: {
    backgroundColor: '#142820',
  },
  keySelected: {
    backgroundColor: colors.sage,
  },
  keyRoot: {
    backgroundColor: '#264F3A',
  },

  keyBody: {
    flex: 1,
    height: 16,
    borderRadius: 3,
    marginHorizontal: 6,
  },
  whiteKeyBody: {
    backgroundColor: '#2A5A42',
  },
  blackKeyBody: {
    backgroundColor: '#1A3A2A',
  },
  keyBodySelected: {
    backgroundColor: colors.fern,
  },
  keyBodyRoot: {
    backgroundColor: colors.pine,
    borderWidth: 1,
    borderColor: colors.fern,
  },

  keyOffset: {
    width: 28,
    color: colors.mint,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
  },
  keyOffsetBlack: {
    color: colors.stone,
  },
  keyOffsetSelected: {
    color: colors.forest,
  },
  keyName: {
    width: 22,
    color: colors.dew,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'left',
  },
  keyNameBlack: {
    color: colors.stone,
  },
  keyNameSelected: {
    color: colors.forest,
    fontWeight: '800',
  },
});
