import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { NoteRow } from '@/components/note-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listNotes, restoreNote, type Note } from '@/data/notes';

export default function TrashScreen() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const load = useCallback(() => {
    listNotes(db, { view: 'trash' }).then(setNotes);
  }, [db]);
  useFocusEffect(load);

  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Notes in Trash are deleted after 30 days.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            right={
              <Pressable
                onPress={() => restoreNote(db, item.id).then(load)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${item.title || 'Untitled'}`}>
                <ThemedText type="linkPrimary">Restore</ThemedText>
              </Pressable>
            }
          />
        )}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            Trash is empty.
          </ThemedText>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { padding: Spacing.three },
  empty: { textAlign: 'center', marginTop: Spacing.six },
});
