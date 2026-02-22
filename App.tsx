import React, { useState } from 'react';
import { Modal, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MainScreen } from './src/screens/MainScreen';
import { SampleEditScreen } from './src/screens/SampleEditScreen';
import { colors } from './src/theme/colors';

export default function App() {
  const [editingChannel, setEditingChannel] = useState<number | null>(null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <MainScreen onEditSample={(channelId) => setEditingChannel(channelId)} />

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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.forest,
  },
});
