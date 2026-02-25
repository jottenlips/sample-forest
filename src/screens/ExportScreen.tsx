import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useAppStore } from '../state/useAppStore';
import {
  renderSong,
  renderSongNative,
  downloadWav,
  shareWavNative,
  sceneDuration,
  ExportMode,
  SongScene,
} from '../utils/offlineRenderer';
import { encodeWavFromSamples } from '../utils/oscillator';

const isWeb = Platform.OS === 'web';

interface ExportScreenProps {
  onClose: () => void;
}

export function ExportScreen({ onClose }: ExportScreenProps) {
  const scenes = useAppStore((s) => s.scenes);
  const channels = useAppStore((s) => s.channels);

  const [songScenes, setSongScenes] = useState<SongScene[]>([]);
  const [exportMode, setExportMode] = useState<ExportMode>('mix');
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Web preview refs
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Native preview ref
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  const channelsWithSamples = channels.filter((ch) => ch.sample);

  // ── Song arrangement ───────────────────────────────────────────

  const addScene = (sceneId: number) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    setSongScenes((prev) => [...prev, { sceneId, scene }]);
  };

  const removeScene = (index: number) => {
    setSongScenes((prev) => prev.filter((_, i) => i !== index));
  };

  const moveScene = (index: number, direction: -1 | 1) => {
    setSongScenes((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // ── Totals ─────────────────────────────────────────────────────

  const totalDuration = songScenes.reduce((sum, ss) => sum + sceneDuration(ss.scene), 0);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(1);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // ── Stop preview ───────────────────────────────────────────────

  const stopPreview = useCallback(async () => {
    if (isWeb) {
      if (previewSourceRef.current) {
        try { previewSourceRef.current.stop(); } catch {}
        previewSourceRef.current = null;
      }
      if (previewCtxRef.current) {
        previewCtxRef.current.close();
        previewCtxRef.current = null;
      }
    } else {
      if (previewSoundRef.current) {
        try { await previewSoundRef.current.stopAsync(); } catch {}
        try { await previewSoundRef.current.unloadAsync(); } catch {}
        previewSoundRef.current = null;
      }
    }
    setIsPreviewing(false);
  }, []);

  // ── Preview ────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (isPreviewing) {
      await stopPreview();
      return;
    }
    if (songScenes.length === 0) return;

    setIsPreviewing(true);
    setProgressMsg('Rendering preview...');

    try {
      if (isWeb) {
        const results = await renderSong(songScenes, channels, {
          mode: 'mix',
          onProgress: setProgressMsg,
        });

        const buf = results.get('mix');
        if (!buf) { setIsPreviewing(false); return; }

        const ctx = new AudioContext();
        previewCtxRef.current = ctx;
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.onended = () => {
          setIsPreviewing(false);
          previewCtxRef.current = null;
          previewSourceRef.current = null;
        };
        previewSourceRef.current = source;
        source.start();
      } else {
        const results = await renderSongNative(songScenes, channels, {
          mode: 'mix',
          onProgress: setProgressMsg,
        });

        const samples = results.get('mix');
        if (!samples) { setIsPreviewing(false); return; }

        // Encode to WAV and write temp file
        const wavBuffer = encodeWavFromSamples(samples);
        const { Paths, Directory, File } = await import('expo-file-system');
        const tmpDir = new Directory(Paths.cache, 'preview');
        if (!tmpDir.exists) tmpDir.create();
        const tmpFile = new File(tmpDir, 'preview.wav');
        if (tmpFile.exists) tmpFile.delete();
        tmpFile.create();
        tmpFile.write(new Uint8Array(wavBuffer));

        const { sound } = await Audio.Sound.createAsync(
          { uri: tmpFile.uri },
          { shouldPlay: true },
        );
        previewSoundRef.current = sound;

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPreviewing(false);
            sound.unloadAsync().catch(() => {});
            previewSoundRef.current = null;
          }
        });
      }
    } catch (err) {
      console.error('Preview error:', err);
      setIsPreviewing(false);
    }
    setProgressMsg('');
  };

  // ── Export ─────────────────────────────────────────────────────

  const handleExport = async () => {
    if (songScenes.length === 0) return;
    if (exportMode === 'stem' && selectedChannelId === null) return;

    setIsRendering(true);
    setProgressMsg('Starting export...');

    try {
      if (isWeb) {
        const results = await renderSong(songScenes, channels, {
          mode: exportMode,
          channelId: selectedChannelId ?? undefined,
          onProgress: setProgressMsg,
        });

        setProgressMsg('Encoding WAV...');
        for (const [label, buffer] of results) {
          const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_');
          downloadWav(buffer, `${safeName}.wav`);
        }
      } else {
        const results = await renderSongNative(songScenes, channels, {
          mode: exportMode,
          channelId: selectedChannelId ?? undefined,
          onProgress: setProgressMsg,
        });

        for (const [label, samples] of results) {
          const safeName = label.replace(/[^a-zA-Z0-9_-]/g, '_');
          setProgressMsg(`Saving ${safeName}.wav...`);
          await shareWavNative(samples, 44100, `${safeName}.wav`);
        }
      }
      setProgressMsg('Done!');
    } catch (err) {
      console.error('Export error:', err);
      setProgressMsg('Export failed');
    } finally {
      setIsRendering(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Export Song</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Song Arrangement */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SONG ARRANGEMENT</Text>
          <Text style={styles.durationLabel}>
            Total: {formatTime(totalDuration)}
          </Text>

          {songScenes.length === 0 && (
            <Text style={styles.emptyText}>
              No scenes added yet. Tap a scene below to add it.
            </Text>
          )}

          {songScenes.map((ss, index) => (
            <View key={`${ss.sceneId}-${index}`} style={styles.arrangementRow}>
              <Text style={styles.arrangementIndex}>{index + 1}</Text>
              <Text style={styles.arrangementName} numberOfLines={1}>
                {ss.scene.name}
              </Text>
              <Text style={styles.arrangementDuration}>
                {formatTime(sceneDuration(ss.scene))}
              </Text>
              <TouchableOpacity
                onPress={() => moveScene(index, -1)}
                style={styles.arrowBtn}
                disabled={index === 0}
              >
                <Text style={[styles.arrowText, index === 0 && styles.arrowDisabled]}>
                  {'\u25B2'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveScene(index, 1)}
                style={styles.arrowBtn}
                disabled={index === songScenes.length - 1}
              >
                <Text
                  style={[
                    styles.arrowText,
                    index === songScenes.length - 1 && styles.arrowDisabled,
                  ]}
                >
                  {'\u25BC'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeScene(index)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add scene buttons */}
          <Text style={styles.addLabel}>ADD SCENE</Text>
          <View style={styles.addSceneRow}>
            {scenes.length === 0 && (
              <Text style={styles.emptyText}>
                No scenes saved. Save scenes from the main screen first.
              </Text>
            )}
            {scenes.map((scene) => (
              <TouchableOpacity
                key={scene.id}
                style={styles.addSceneBtn}
                onPress={() => addScene(scene.id)}
              >
                <Text style={styles.addSceneBtnText}>+ {scene.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Export Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>EXPORT MODE</Text>
          <View style={styles.modeRow}>
            {(['mix', 'stems', 'stem'] as ExportMode[]).map((mode) => {
              const labels: Record<ExportMode, string> = {
                mix: 'Full Mix',
                stems: 'All Stems',
                stem: 'Single Stem',
              };
              return (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeBtn, exportMode === mode && styles.modeBtnActive]}
                  onPress={() => setExportMode(mode)}
                >
                  <Text
                    style={[
                      styles.modeBtnText,
                      exportMode === mode && styles.modeBtnTextActive,
                    ]}
                  >
                    {labels[mode]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Channel picker for single stem */}
          {exportMode === 'stem' && (
            <View style={styles.channelPicker}>
              <Text style={styles.addLabel}>SELECT CHANNEL</Text>
              {channelsWithSamples.map((ch) => (
                <TouchableOpacity
                  key={ch.id}
                  style={[
                    styles.channelPickerRow,
                    selectedChannelId === ch.id && styles.channelPickerRowActive,
                  ]}
                  onPress={() => setSelectedChannelId(ch.id)}
                >
                  <Text
                    style={[
                      styles.channelPickerText,
                      selectedChannelId === ch.id && styles.channelPickerTextActive,
                    ]}
                  >
                    {ch.label}
                    {ch.sample ? ` — ${ch.sample.name}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Progress */}
        {progressMsg !== '' && (
          <View style={styles.progressRow}>
            {isRendering && <ActivityIndicator color={colors.sage} size="small" />}
            <Text style={styles.progressText}>{progressMsg}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.previewBtn, songScenes.length === 0 && styles.btnDisabled]}
            onPress={handlePreview}
            disabled={songScenes.length === 0 || isRendering}
          >
            <Text style={styles.previewBtnText}>
              {isPreviewing ? 'Stop' : 'Preview'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.exportBtn,
              (songScenes.length === 0 || isRendering) && styles.btnDisabled,
            ]}
            onPress={handleExport}
            disabled={songScenes.length === 0 || isRendering}
          >
            <Text style={styles.exportBtnText}>
              {isRendering ? 'Rendering...' : 'Export WAV'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
  },
  backButton: {
    color: colors.sage,
    fontSize: 16,
    fontWeight: '600',
    width: 60,
  },
  title: {
    color: colors.dew,
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Section
  section: {
    backgroundColor: colors.pine,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  durationLabel: {
    color: colors.seafoam,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },

  // Arrangement rows
  emptyText: {
    color: colors.stone,
    fontSize: 12,
    fontStyle: 'italic',
    marginVertical: 8,
  },
  arrangementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.forest,
    borderRadius: 6,
    padding: 8,
    marginBottom: 4,
    gap: 6,
  },
  arrangementIndex: {
    color: colors.stone,
    fontSize: 12,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  arrangementName: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  arrangementDuration: {
    color: colors.mint,
    fontSize: 11,
    fontWeight: '600',
  },
  arrowBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: colors.pine,
  },
  arrowText: {
    color: colors.mint,
    fontSize: 12,
  },
  arrowDisabled: {
    color: colors.stone,
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: colors.pine,
  },
  removeBtnText: {
    color: colors.recording,
    fontSize: 12,
    fontWeight: '700',
  },

  // Add scene
  addLabel: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 6,
  },
  addSceneRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  addSceneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.fern,
    borderStyle: 'dashed',
  },
  addSceneBtnText: {
    color: colors.fern,
    fontSize: 12,
    fontWeight: '600',
  },

  // Export mode
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: colors.forest,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.sage,
  },
  modeBtnText: {
    color: colors.mist,
    fontSize: 12,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: colors.forest,
    fontWeight: '700',
  },

  // Channel picker
  channelPicker: {
    marginTop: 8,
  },
  channelPickerRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.forest,
    marginBottom: 4,
  },
  channelPickerRowActive: {
    backgroundColor: colors.fern,
  },
  channelPickerText: {
    color: colors.mist,
    fontSize: 13,
    fontWeight: '600',
  },
  channelPickerTextActive: {
    color: colors.dew,
    fontWeight: '700',
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  progressText: {
    color: colors.seafoam,
    fontSize: 12,
    fontWeight: '600',
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  previewBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.pine,
    alignItems: 'center',
  },
  previewBtnText: {
    color: colors.sage,
    fontSize: 16,
    fontWeight: '700',
  },
  exportBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.sage,
    alignItems: 'center',
  },
  exportBtnText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
