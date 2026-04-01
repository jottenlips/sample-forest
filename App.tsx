import React, { useState, useEffect } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MainScreen } from './src/screens/MainScreen';
import { SampleEditScreen } from './src/screens/SampleEditScreen';
import { ChopScreen } from './src/screens/ChopScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { SynthModal } from './src/components/synth/SynthModal';
import { GrainSynthScreen } from './src/screens/GrainSynthScreen';
import { KeyboardScreen } from './src/screens/KeyboardScreen';
import { SampleBankModal } from './src/components/SampleBankModal';
import { colors } from './src/theme/colors';
import { useAppStore } from './src/state/useAppStore';

// Inject global CSS on web to eliminate Safari tap delay and improve touch responsiveness
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    * { touch-action: manipulation; }
    input, textarea { touch-action: auto; }
  `;
  document.head.appendChild(style);
}

export default function App() {
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [synthChannel, setSynthChannel] = useState<number | null>(null);
  const [showChop, setShowChop] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [grainSynthChannel, setGrainSynthChannel] = useState<number | null>(null);
  const [keyboardChannel, setKeyboardChannel] = useState<number | null>(null);
  const [bankChannel, setBankChannel] = useState<number | null>(null);
  const loadSample = useAppStore((s) => s.loadSample);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <MainScreen
          onEditSample={(channelId) => setEditingChannel(channelId)}
          onOpenSynth={(channelId) => setSynthChannel(channelId)}
          onChopSong={() => setShowChop(true)}
          onOpenGrainSynth={(channelId) => setGrainSynthChannel(channelId)}
          onOpenKeyboard={(channelId) => setKeyboardChannel(channelId)}
          onOpenBank={(channelId) => setBankChannel(channelId)}
          onExport={() => setShowExport(true)}
        />

        <Modal
          visible={editingChannel !== null}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setEditingChannel(null)}
        >
          {editingChannel !== null && (
            <SampleEditScreen
              channelId={editingChannel}
              onClose={() => setEditingChannel(null)}
            />
          )}
        </Modal>

        <Modal
          visible={synthChannel !== null}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSynthChannel(null)}
        >
          {synthChannel !== null && (
            <SynthModal
              channelId={synthChannel}
              onClose={() => setSynthChannel(null)}
            />
          )}
        </Modal>

        <Modal
          visible={grainSynthChannel !== null}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setGrainSynthChannel(null)}
        >
          {grainSynthChannel !== null && (
            <GrainSynthScreen
              channelId={grainSynthChannel}
              onClose={() => setGrainSynthChannel(null)}
            />
          )}
        </Modal>

        <Modal
          visible={keyboardChannel !== null}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setKeyboardChannel(null)}
        >
          {keyboardChannel !== null && (
            <KeyboardScreen
              channelId={keyboardChannel}
              onClose={() => setKeyboardChannel(null)}
            />
          )}
        </Modal>

        <SampleBankModal
          visible={bankChannel !== null}
          onClose={() => setBankChannel(null)}
          onSelect={(sample) => {
            if (bankChannel !== null) {
              // Give a fresh ID so the channel player re-loads the audio buffer
              loadSample(bankChannel, {
                ...sample,
                id: `bank_${Date.now()}`,
              });
            }
          }}
        />

        <Modal
          visible={showChop}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowChop(false)}
        >
          <ChopScreen onClose={() => setShowChop(false)} />
        </Modal>

        <Modal
          visible={showExport}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowExport(false)}
        >
          <ExportScreen onClose={() => setShowExport(false)} />
        </Modal>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.forest,
    ...(Platform.OS === 'web' ? {
      userSelect: 'none' as any,
      // Eliminate Safari's 300ms tap delay on all touch targets
      touchAction: 'manipulation' as any,
    } : {}),
  },
});
