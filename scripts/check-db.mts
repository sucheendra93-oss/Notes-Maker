// Self-check for schema, FTS and note queries against real SQLite.
// Run: npm run check:db  (needs Node 24+: older node:sqlite builds lack FTS5)
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../src/data/db.ts';
import { createNotebook, deleteNotebook, listNotebooks } from '../src/data/notebooks.ts';
import * as notes from '../src/data/notes.ts';

const raw = new DatabaseSync(':memory:');
const flat = (a: unknown[]) => (a.length === 1 && Array.isArray(a[0]) ? a[0] : a);
const db = {
  execAsync: async (sql: string) => void raw.exec(sql),
  runAsync: async (sql: string, ...p: any[]) => raw.prepare(sql).run(...flat(p)),
  getAllAsync: async (sql: string, ...p: any[]) => raw.prepare(sql).all(...flat(p)),
  getFirstAsync: async (sql: string, ...p: any[]) => raw.prepare(sql).get(...flat(p)) ?? null,
} as any;

await migrate(db);
await migrate(db); // idempotent

await createNotebook(db, 'nb1', ' Work ');
await notes.createNote(db, 'a', 'nb1');
await notes.updateNote(db, 'a', { title: 'Grocery list', contentText: 'Buy café beans', tags: ['Home', 'home ', 'errands'] });
await notes.createNote(db, 'b');
await notes.updateNote(db, 'b', { title: 'Ideas "quoted"', contentText: 'nothing', isArchived: true });

assert.deepEqual((await notes.getNote(db, 'a'))!.tags, ['home', 'errands']);
assert.deepEqual((await notes.listNotes(db, { search: 'groc' })).map((n) => n.id), ['a']);
assert.deepEqual((await notes.listNotes(db, { search: 'cafe' })).map((n) => n.id), ['a'], 'diacritics');
assert.equal((await notes.listNotes(db, { search: '"quo' })).length, 0, 'archived hidden, quote safe');
assert.deepEqual((await notes.listNotes(db, { view: 'archived', search: 'quoted' })).map((n) => n.id), ['b']);
assert.deepEqual((await notes.listNotes(db, { tag: 'errands' })).map((n) => n.id), ['a']);
assert.deepEqual(await notes.listTags(db), ['errands', 'home']);

await notes.trashNote(db, 'a');
assert.equal((await notes.listNotes(db)).length, 0);
assert.deepEqual((await notes.listNotes(db, { view: 'trash' })).map((n) => n.id), ['a']);
await notes.restoreNote(db, 'a');
assert.equal((await notes.listNotes(db)).length, 1);

// purge: synced-pending tombstone kept, never-synced one removed
await notes.trashNote(db, 'a');
raw.exec("UPDATE notes SET drive_file_id = 'f1' WHERE id = 'a'");
await notes.purgeTrash(db, Date.now() + notes.TRASH_RETENTION_MS + 1);
assert.ok(await notes.getNote(db, 'a'), 'dirty tombstone kept');
raw.exec("UPDATE notes SET synced_version = version WHERE id = 'a'");
await notes.purgeTrash(db, Date.now() + notes.TRASH_RETENTION_MS + 1);
assert.equal(await notes.getNote(db, 'a'), null);
assert.equal((await notes.listNotes(db, { search: 'grocery', view: 'trash' })).length, 0, 'fts cleaned');

await notes.createNote(db, 'empty');
await notes.discardIfEmpty(db, 'empty');
assert.equal(await notes.getNote(db, 'empty'), null);

await notes.createNote(db, 'c', 'nb1');
assert.equal((await listNotebooks(db))[0].noteCount, 1);
await deleteNotebook(db, 'nb1');
assert.equal((await listNotebooks(db)).length, 0);
assert.equal((await notes.getNote(db, 'c'))!.notebookId, null);

console.log('check-db: ok');
