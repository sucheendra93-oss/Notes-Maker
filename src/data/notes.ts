import type { Db } from './db';

export type Note = {
  id: string;
  title: string;
  contentJson: string | null;
  contentText: string;
  notebookId: string | null;
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type NotePatch = Partial<
  Pick<Note, 'title' | 'contentJson' | 'contentText' | 'notebookId' | 'tags' | 'isFavorite' | 'isArchived'>
>;

export type NoteFilter = {
  search?: string;
  notebookId?: string;
  tag?: string;
  view?: 'active' | 'archived' | 'trash';
};

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Row = {
  id: string;
  title: string;
  content_json: string | null;
  content_text: string;
  notebook_id: string | null;
  tags: string;
  is_favorite: number;
  is_archived: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

const toNote = (r: Row): Note => ({
  id: r.id,
  title: r.title,
  contentJson: r.content_json,
  contentText: r.content_text,
  notebookId: r.notebook_id,
  tags: JSON.parse(r.tags),
  isFavorite: !!r.is_favorite,
  isArchived: !!r.is_archived,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export const normalizeTags = (tags: string[]) => [
  ...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
];

// User text -> safe FTS5 query: every word is a quoted prefix term, ANDed.
export function toFtsQuery(input: string): string | null {
  const terms = input
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replaceAll('"', '""')}"*`);
  return terms.length ? terms.join(' ') : null;
}

export async function createNote(db: Db, id: string, notebookId: string | null = null): Promise<Note> {
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO notes (id, notebook_id, created_at, updated_at) VALUES (?, ?, ?, ?)',
    id,
    notebookId,
    now,
    now,
  );
  return (await getNote(db, id))!;
}

export async function getNote(db: Db, id: string): Promise<Note | null> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM notes WHERE id = ?', id);
  return r ? toNote(r) : null;
}

const COLUMNS: Record<keyof NotePatch, string> = {
  title: 'title',
  contentJson: 'content_json',
  contentText: 'content_text',
  notebookId: 'notebook_id',
  tags: 'tags',
  isFavorite: 'is_favorite',
  isArchived: 'is_archived',
};

export async function updateNote(db: Db, id: string, patch: NotePatch) {
  const keys = Object.keys(patch) as (keyof NotePatch)[];
  if (!keys.length) return;
  const values = keys.map((k) => {
    const v = patch[k];
    if (k === 'tags') return JSON.stringify(normalizeTags(v as string[]));
    if (typeof v === 'boolean') return v ? 1 : 0;
    return (v as string | number | null) ?? null;
  });
  // version bump marks the note dirty for sync (dirty = version != synced_version).
  await db.runAsync(
    `UPDATE notes SET ${keys.map((k) => `${COLUMNS[k]} = ?`).join(', ')},
       updated_at = ?, version = version + 1 WHERE id = ?`,
    ...values,
    Date.now(),
    id,
  );
}

export async function trashNote(db: Db, id: string) {
  await db.runAsync(
    'UPDATE notes SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?',
    Date.now(),
    Date.now(),
    id,
  );
}

export async function restoreNote(db: Db, id: string) {
  await db.runAsync(
    'UPDATE notes SET deleted_at = NULL, updated_at = ?, version = version + 1 WHERE id = ?',
    Date.now(),
    id,
  );
}

// Drop a never-edited note instead of leaving an empty one behind.
export async function discardIfEmpty(db: Db, id: string) {
  await db.runAsync(
    "DELETE FROM notes WHERE id = ? AND title = '' AND content_text = '' AND drive_file_id IS NULL",
    id,
  );
}

// Tombstones stay until the deletion has reached Drive; never-synced notes go right away.
export async function purgeTrash(db: Db, now = Date.now()) {
  await db.runAsync(
    `DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?
       AND (drive_file_id IS NULL OR version = synced_version)`,
    now - TRASH_RETENTION_MS,
  );
}

export async function listNotes(db: Db, f: NoteFilter = {}): Promise<Note[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const view = f.view ?? 'active';
  where.push(view === 'trash' ? 'n.deleted_at IS NOT NULL' : 'n.deleted_at IS NULL');
  if (view === 'active') where.push('n.is_archived = 0');
  if (view === 'archived') where.push('n.is_archived = 1');
  if (f.notebookId) {
    where.push('n.notebook_id = ?');
    params.push(f.notebookId);
  }
  if (f.tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(n.tags) WHERE value = ?)');
    params.push(f.tag);
  }
  const fts = f.search ? toFtsQuery(f.search) : null;
  if (fts) {
    where.push('n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)');
    params.push(fts);
  }
  const rows = await db.getAllAsync<Row>(
    `SELECT n.* FROM notes n WHERE ${where.join(' AND ')}
     ORDER BY n.is_favorite DESC, n.updated_at DESC`,
    ...params,
  );
  return rows.map(toNote);
}

export async function listTags(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ value: string }>(
    `SELECT DISTINCT j.value FROM notes n, json_each(n.tags) j
     WHERE n.deleted_at IS NULL ORDER BY j.value`,
  );
  return rows.map((r) => r.value);
}
