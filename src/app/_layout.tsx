import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useColorScheme } from 'react-native';

import { DB_NAME, migrate } from '@/data/db';
import { purgeTrash } from '@/data/notes';

async function init(db: SQLiteDatabase) {
  await migrate(db);
  await purgeTrash(db);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SQLiteProvider databaseName={DB_NAME} onInit={init}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="note/[id]" options={{ title: '' }} />
          <Stack.Screen name="trash" options={{ title: 'Trash' }} />
        </Stack>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
