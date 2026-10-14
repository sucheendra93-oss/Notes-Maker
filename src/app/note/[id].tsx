import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listNotebooks, type Notebook } from '@/data/notebooks';
import { discardIfEmpty, getNote, trashNote, updateNote, type Note, type NotePatch } from '@/data/notes';
import LexicalEditor from '@/editor/LexicalEditor';
import { useTheme } from '@/hooks/use-theme';

const SAVE_DELAY_MS = 500;
const MAX_CONTENT_BYTES = 5_000_000;

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const [note, setNote] = useState<Note | null | undefined>();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState<string>();

  // Edits are buffered here and written on a short debounce, plus on leave/background.
  const pending = useRef<NotePatch>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length) await updateNote(db, id, patch);
  }, [db, id]);

  const queue = useCallback(
    (patch: NotePatch) => {
      Object.assign(pending.current, patch);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => {
    (async () => {
      const [n, b] = await Promise.all([getNote(db, id), listNotebooks(db)]);
      setNote(n);
      setNotebooks(b);
      setTagsText(n?.tags.join(', ') ?? '');
    })();
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && flush());
    return () => {
      sub.remove();
      flush().then(() => discardIfEmpty(db, id));
    };
  }, [db, id, flush]);

  const onEditorChange = useCallback(
    async (json: string, plainText: string) => {
      if (json.length > MAX_CONTENT_BYTES) return setError('Note is too large to save.');
      queue({ contentJson: json, contentText: plainText });
    },
    [queue],
  );
  const onEditorError = useCallback(async (message: string) => setError(message), []);
  const onOpenLink = useCallback(async (url: string) => {
    if (/^https?:\/\//i.test(url)) await Linking.openURL(url);
  }, []);

  if (note === undefined) return <ThemedView style={styles.flex} />;
  if (note === null || note.deletedAt)
    return (
      <ThemedView style={[styles.flex, styles.center]}>
        <ThemedText themeColor="textSecondary">Note not found.</ThemedText>
      </ThemedView>
    );

  const set = (patch: NotePatch) => {
    setNote({ ...note, ...patch });
    queue(patch);
  };
  const confirmDelete = () =>
    Alert.alert('Move to Trash?', 'You can restore it from Trash for 30 days.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to Trash',
        style: 'destructive',
        onPress: async () => {
          await flush();
          await trashNote(db, id);
          router.back();
        },
      },
    ]);

  const action = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      <ThemedText type="linkPrimary">{label}</ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.actions}>
              {action(note.isFavorite ? '★' : '☆', () => set({ isFavorite: !note.isFavorite }))}
              {action(note.isArchived ? 'Unarchive' : 'Archive', () => set({ isArchived: !note.isArchived }))}
              {action('Delete', confirmDelete)}
            </View>
          ),
        }}
      />
      <TextInput
        defaultValue={note.title}
        onChangeText={(title) => queue({ title })}
        placeholder="Title"
        placeholderTextColor={theme.textSecondary}
        style={[styles.title, { color: theme.text }]}
        accessibilityLabel="Note title"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meta}>
        {[{ id: null, name: 'No notebook' }, ...notebooks].map((b) => (
          <Pressable
            key={b.id ?? 'none'}
            onPress={() => set({ notebookId: b.id })}
            style={[
              styles.chip,
              { backgroundColor: note.notebookId === b.id ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <ThemedText type="small">📓 {b.name}</ThemedText>
          </Pressable>
        ))}
      </ScrollView>
      <TextInput
        value={tagsText}
        onChangeText={(t) => {
          setTagsText(t);
          queue({ tags: t.split(',') });
        }}
        placeholder="Tags, comma separated"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        style={[styles.tags, { color: theme.text }]}
        accessibilityLabel="Tags"
      />
      {error && (
        <ThemedText style={styles.error} accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
      <LexicalEditor
        key={id}
        initialJson={note.contentJson}
        dark={dark}
        onChange={onEditorChange}
        onError={onEditorError}
        onOpenLink={onOpenLink}
        dom={{ style: { flex: 1 }, scrollEnabled: false }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.three },
  title: { fontSize: 24, fontWeight: '600', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  meta: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + Spacing.half, borderRadius: 16 },
  tags: { fontSize: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  error: { color: '#d33', paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
