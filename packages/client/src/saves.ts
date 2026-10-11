/**
 * Local saves (PLAN.md §4): gzip-compressed JSON in IndexedDB, plus export/import as
 * files. An autosave slot is written at the start of every turn.
 */

const DB = 'civolution';
const STORE = 'saves';

export interface SaveMeta {
  name: string;
  turn: number;
  savedAt: string;
  bytes: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function compress(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function decompress(data: ArrayBuffer): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

interface Stored {
  meta: SaveMeta;
  data: ArrayBuffer;
}

export async function writeSave(name: string, turn: number, text: string): Promise<SaveMeta> {
  const data = await compress(text);
  const meta: SaveMeta = { name, turn, savedAt: new Date().toISOString(), bytes: data.byteLength };
  await tx('readwrite', (s) => s.put({ meta, data } satisfies Stored, name));
  return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<Stored[]>('readonly', (s) => s.getAll() as IDBRequest<Stored[]>);
  return all.map((x) => x.meta).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function readSave(name: string): Promise<string> {
  const stored = await tx<Stored | undefined>('readonly', (s) => s.get(name) as IDBRequest<Stored | undefined>);
  if (!stored) throw new Error(`No save named "${name}".`);
  return decompress(stored.data);
}

export async function deleteSave(name: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(name));
}

export function downloadText(filename: string, data: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/gzip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
