import React, { useState } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MainScreen } from './src/screens/MainScreen';
import { SampleEditScreen } from './src/screens/SampleEditScreen';
import { ChopScreen } from './src/screens/ChopScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { SynthModal } from './src/components/synth/SynthModal';
import { colors } from './src/theme/colors';

export default function App() {
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [synthChannel, setSynthChannel] = useState<number | null>(null);
  const [showChop, setShowChop] = useState(false);
  const [showExport, setShowExport] = useState(false);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <MainScreen
          onEditSample={(channelId) => setEditingChannel(channelId)}
          onOpenSynth={(channelId) => setSynthChannel(channelId)}
          onChopSong={() => setShowChop(true)}
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
    ...(Platform.OS === 'web' ? { userSelect: 'none' as any } : {}),
  },
});
