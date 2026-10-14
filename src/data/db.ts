import type { SQLiteDatabase } from 'expo-sqlite';

export type Db = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

export const DB_NAME = 'notes.db';

// Append-only: never edit a shipped step, add a new one.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE notebooks (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    synced_version INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content_json TEXT,
    content_text TEXT NOT NULL DEFAULT '',
    notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    synced_version INTEGER NOT NULL DEFAULT 0,
    drive_file_id TEXT,
    remote_revision TEXT
  );
  CREATE INDEX notes_updated_at ON notes(updated_at);
  CREATE INDEX notes_notebook_id ON notes(notebook_id);
  CREATE INDEX notes_dirty ON notes(version, synced_version);

  CREATE TABLE sync_state (key TEXT PRIMARY KEY NOT NULL, value TEXT);

  CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, content_text, content='notes', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.rowid, new.title, new.content_text);
  END;
  CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content_text) VALUES ('delete', old.rowid, old.title, old.content_text);
  END;
  CREATE TRIGGER notes_au AFTER UPDATE OF title, content_text ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content_text) VALUES ('delete', old.rowid, old.title, old.content_text);
    INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.rowid, new.title, new.content_text);
  END;
  `,
];

export async function migrate(db: Db) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    try {
      await db.execAsync(`BEGIN; ${MIGRATIONS[v]} PRAGMA user_version = ${v + 1}; COMMIT;`);
    } catch (e) {
      await db.execAsync('ROLLBACK').catch(() => {});
      throw e;
    }
  }
}
