import type { Db } from './db';

export type Notebook = { id: string; name: string; noteCount: number };

export async function listNotebooks(db: Db): Promise<Notebook[]> {
  return db.getAllAsync<Notebook>(
    `SELECT b.id, b.name,
       (SELECT COUNT(*) FROM notes n WHERE n.notebook_id = b.id AND n.deleted_at IS NULL) AS noteCount
     FROM notebooks b WHERE b.deleted_at IS NULL ORDER BY b.name COLLATE NOCASE`,
  );
}

export async function createNotebook(db: Db, id: string, name: string) {
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO notebooks (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    id,
    name.trim(),
    now,
    now,
  );
}

export async function renameNotebook(db: Db, id: string, name: string) {
  await db.runAsync(
    'UPDATE notebooks SET name = ?, updated_at = ?, version = version + 1 WHERE id = ?',
    name.trim(),
    Date.now(),
    id,
  );
}

// Soft delete; its notes move to "no notebook" rather than being deleted.
export async function deleteNotebook(db: Db, id: string) {
  const now = Date.now();
  await db.execAsync('BEGIN');
  try {
    await db.runAsync(
      'UPDATE notes SET notebook_id = NULL, updated_at = ?, version = version + 1 WHERE notebook_id = ?',
      now,
      id,
    );
    await db.runAsync(
      'UPDATE notebooks SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?',
      now,
      now,
      id,
    );
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
