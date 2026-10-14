import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Note } from '@/data/notes';
import { useTheme } from '@/hooks/use-theme';

export function NoteRow({ note, onPress, right }: { note: Note; onPress?: () => void; right?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderColor: theme.backgroundSelected }, pressed && { opacity: 0.6 }]}>
      <View style={styles.body}>
        <ThemedText numberOfLines={1}>
          {note.isFavorite ? '★ ' : ''}
          {note.title || 'Untitled'}
        </ThemedText>
        {!!note.contentText && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {note.contentText}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {new Date(note.updatedAt).toLocaleDateString()}
          {note.tags.length ? `  ·  #${note.tags.join(' #')}` : ''}
        </ThemedText>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: Spacing.half },
});
