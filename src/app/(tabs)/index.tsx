import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoteRow } from '@/components/note-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { listNotebooks, type Notebook } from '@/data/notebooks';
import { createNote, listNotes, listTags, type Note } from '@/data/notes';
import { useTheme } from '@/hooks/use-theme';

export default function NotesScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { notebookId } = useLocalSearchParams<{ notebookId?: string }>();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string>();
  const [archived, setArchived] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const [n, t, b] = await Promise.all([
          listNotes(db, { search, tag, notebookId, view: archived ? 'archived' : 'active' }),
          listTags(db),
          listNotebooks(db),
        ]);
        if (!live) return;
        setNotes(n);
        setTags(t);
        setNotebooks(b);
      })();
      return () => {
        live = false;
      };
    }, [db, search, tag, notebookId, archived]),
  );

  const newNote = async () => {
    const id = randomUUID();
    await createNote(db, id, notebookId ?? null);
    router.push(`/note/${id}`);
  };

  const notebookName = notebooks.find((b) => b.id === notebookId)?.name;
  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement }]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <View style={styles.header}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search notes"
            placeholderTextColor={theme.textSecondary}
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            returnKeyType="search"
            accessibilityLabel="Search notes"
          />
          <Pressable onPress={() => router.push('/trash')} hitSlop={8} accessibilityRole="button">
            <ThemedText type="linkPrimary">Trash</ThemedText>
          </Pressable>
        </View>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {notebookName && chip(`📓 ${notebookName} ✕`, true, () => router.setParams({ notebookId: undefined }))}
            {chip('Archived', archived, () => setArchived(!archived))}
            {tags.map((t) => chip(`#${t}`, tag === t, () => setTag(tag === t ? undefined : t)))}
          </ScrollView>
        </View>
        <FlatList
          data={notes}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NoteRow note={item} onPress={() => router.push(`/note/${item.id}`)} />}
          contentContainerStyle={{ paddingBottom: BottomTabInset + 80 }}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {search || tag || notebookId || archived ? 'No matching notes' : 'No notes yet. Tap + to write one.'}
            </ThemedText>
          }
        />
        <Pressable
          onPress={newNote}
          accessibilityRole="button"
          accessibilityLabel="New note"
          style={[styles.fab, { bottom: BottomTabInset + Spacing.three }]}>
          <ThemedText style={styles.fabText}>+</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  search: { flex: 1, height: 44, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16 },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + Spacing.half, borderRadius: 16 },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 36 },
});
