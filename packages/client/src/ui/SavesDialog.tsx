import { useEffect, useRef, useState } from 'react';
import { host } from '../host/client.ts';
import { compress, decompress, deleteSave, downloadText, listSaves, readSave, writeSave, type SaveMeta } from '../saves.ts';
import { useGame } from '../store.ts';
import { Dialog } from './Dialog.tsx';

export function SavesDialog({ mode, onClose }: { mode: 'save' | 'load'; onClose: () => void }) {
  const snapshot = useGame((s) => s.snapshot);
  const load = useGame((s) => s.load);
  const toast = useGame((s) => s.showToast);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [name, setName] = useState(() => (snapshot ? `Turn ${snapshot.state.turn}` : ''));
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => void listSaves().then(setSaves, (e: unknown) => toast(String(e)));
  useEffect(refresh, [toast]);

  const save = async () => {
    if (!snapshot || !name.trim()) return;
    const text = await host().save();
    await writeSave(name.trim(), snapshot.state.turn, text);
    toast(`Saved "${name.trim()}".`);
    onClose();
  };
  const open = async (n: string) => {
    await load(await readSave(n));
    onClose();
  };
  const exportFile = async () => {
    const text = await host().save();
    downloadText(`civolution-turn-${snapshot?.state.turn ?? 0}.civsave`, await compress(text));
  };
  const importFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    let text: string;
    try {
      text = await decompress(buf);
    } catch {
      text = new TextDecoder().decode(buf);
    }
    await load(text);
    onClose();
  };

  return (
    <Dialog title={mode === 'save' ? 'Save game' : 'Load game'} onClose={onClose}>
      {mode === 'save' && (
        <div className="field row">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} aria-label="Save name" />
          <button className="primary" onClick={() => void save()}>
            Save
          </button>
        </div>
      )}
      <ul className="save-list">
        {saves.length === 0 && <li className="empty">No saves yet.</li>}
        {saves.map((s) => (
          <li key={s.name}>
            <button className="save-open" onClick={() => (mode === 'load' ? void open(s.name) : setName(s.name))}>
              <strong>{s.name}</strong>
              <span>
                Turn {s.turn} · {new Date(s.savedAt).toLocaleString()} · {Math.round(s.bytes / 1024)} KB
              </span>
            </button>
            <button className="icon" aria-label={`Delete ${s.name}`} onClick={() => void deleteSave(s.name).then(refresh)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        {mode === 'save' ? (
          <button onClick={() => void exportFile()}>Export to file</button>
        ) : (
          <>
            <input ref={file} type="file" accept=".civsave,.json,.gz" hidden onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
            <button onClick={() => file.current?.click()}>Import file</button>
          </>
        )}
        <button onClick={onClose}>Close</button>
      </div>
    </Dialog>
  );
}
