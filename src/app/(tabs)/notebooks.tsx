import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { createNotebook, deleteNotebook, listNotebooks, renameNotebook, type Notebook } from '@/data/notebooks';
import { useTheme } from '@/hooks/use-theme';

export default function NotebooksScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string }>();

  const load = useCallback(() => {
    listNotebooks(db).then(setNotebooks);
  }, [db]);
  useFocusEffect(load);

  const add = async () => {
    if (!name.trim()) return;
    await createNotebook(db, randomUUID(), name);
    setName('');
    load();
  };
  const saveRename = async () => {
    if (editing?.name.trim()) await renameNotebook(db, editing.id, editing.name);
    setEditing(undefined);
    load();
  };
  const remove = (b: Notebook) =>
    Alert.alert(`Delete "${b.name}"?`, 'Its notes are kept and moved out of the notebook.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNotebook(db, b.id).then(load) },
    ]);

  const input = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={add}
            placeholder="New notebook"
            placeholderTextColor={theme.textSecondary}
            style={input}
            returnKeyType="done"
            accessibilityLabel="New notebook name"
          />
          <Pressable onPress={add} hitSlop={8} accessibilityRole="button">
            <ThemedText type="linkPrimary">Add</ThemedText>
          </Pressable>
        </View>
        <FlatList
          data={notebooks}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ paddingBottom: BottomTabInset }}
          renderItem={({ item }) =>
            editing?.id === item.id ? (
              <View style={styles.row}>
                <TextInput
                  autoFocus
                  value={editing.name}
                  onChangeText={(n) => setEditing({ id: item.id, name: n })}
                  onSubmitEditing={saveRename}
                  style={input}
                  accessibilityLabel="Notebook name"
                />
                <Pressable onPress={saveRename} hitSlop={8} accessibilityRole="button">
                  <ThemedText type="linkPrimary">Save</ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => router.navigate({ pathname: '/', params: { notebookId: item.id } })}
                style={[styles.row, { borderColor: theme.backgroundSelected }]}
                accessibilityRole="button">
                <ThemedText style={styles.flex} numberOfLines={1}>
                  📓 {item.name}{' '}
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.noteCount}
                  </ThemedText>
                </ThemedText>
                <Pressable onPress={() => setEditing({ id: item.id, name: item.name })} hitSlop={8}>
                  <ThemedText type="linkPrimary">Rename</ThemedText>
                </Pressable>
                <Pressable onPress={() => remove(item)} hitSlop={8}>
                  <ThemedText type="linkPrimary">Delete</ThemedText>
                </Pressable>
              </Pressable>
            )
          }
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No notebooks yet.
            </ThemedText>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  input: { flex: 1, height: 44, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { textAlign: 'center', marginTop: Spacing.six },
});
