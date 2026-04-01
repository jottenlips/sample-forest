import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { colors } from '../theme/colors';
import { Sample } from '../types';
import { BankEntry, loadBank, removeSampleFromBank } from '../utils/sampleBank';

interface SampleBankModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (sample: Sample) => void;
}

export function SampleBankModal({ visible, onClose, onSelect }: SampleBankModalProps) {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const bank = await loadBank();
    // Sort newest first
    bank.sort((a, b) => b.savedAt - a.savedAt);
    setEntries(bank);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const handleDelete = useCallback((entry: BankEntry) => {
    const doDelete = async () => {
      await removeSampleFromBank(entry.sample.id);
      refresh();
    };

    if (Platform.OS === 'web') {
      if (confirm(`Delete "${entry.sample.name}" from sample bank?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Sample',
        `Remove "${entry.sample.name}" from your sample bank?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  }, [refresh]);

  const renderItem = useCallback(({ item }: { item: BankEntry }) => {
    const date = new Date(item.savedAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
      <View style={styles.entry}>
        <TouchableOpacity
          style={styles.entryMain}
          onPress={() => {
            onSelect(item.sample);
            onClose();
          }}
        >
          <Text style={styles.entryName} numberOfLines={1}>{item.sample.name}</Text>
          <View style={styles.entryMeta}>
            <Text style={styles.entryDuration}>
              {(item.sample.durationMs / 1000).toFixed(1)}s
            </Text>
            <Text style={styles.entryDate}>{dateStr}</Text>
            {item.tags.length > 0 && (
              <Text style={styles.entryTags}>{item.tags.join(', ')}</Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }, [onSelect, onClose, handleDelete]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Sample Bank</Text>
          <View style={{ width: 60 }} />
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No saved samples</Text>
            <Text style={styles.emptyText}>
              Save samples from any channel to build your reusable sample bank.
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.sample.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </Modal>
  );
}

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
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
  },
  closeBtn: {
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
  list: {
    padding: 12,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.pine,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  entryMain: {
    flex: 1,
    padding: 14,
  },
  entryName: {
    color: colors.dew,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  entryMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  entryDuration: {
    color: colors.sage,
    fontSize: 12,
    fontWeight: '600',
  },
  entryDate: {
    color: colors.stone,
    fontSize: 12,
  },
  entryTags: {
    color: colors.seafoam,
    fontSize: 12,
    fontStyle: 'italic',
  },
  deleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: colors.recording,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: colors.dew,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: colors.stone,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
});
