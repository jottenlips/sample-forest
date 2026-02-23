import React, { useState } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MainScreen } from './src/screens/MainScreen';
import { SampleEditScreen } from './src/screens/SampleEditScreen';
import { ChopScreen } from './src/screens/ChopScreen';
import { colors } from './src/theme/colors';

export default function App() {
  const [editingChannel, setEditingChannel] = useState<number | null>(null);
  const [showChop, setShowChop] = useState(false);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <MainScreen
          onEditSample={(channelId) => setEditingChannel(channelId)}
          onChopSong={() => setShowChop(true)}
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
          visible={showChop}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowChop(false)}
        >
          <ChopScreen onClose={() => setShowChop(false)} />
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
