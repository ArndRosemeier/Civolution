/**
 * The Civilopedia (F10, or any "?" link in the game): categories on the left, a search,
 * and pages with their facts and our own prose. Links between pages keep a history for
 * Back. It sits above every other screen, so a city or advisor stays open beneath it.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATEGORIES, parseLinks, pediaEntries, pediaEntry, type FactValue, type PediaCategory, type PediaEntry, type PediaLinkRef } from '../pedia/index.ts';
import { useGame } from '../store.ts';

/** A link that opens a Civilopedia page. */
export function PediaLink({ to, children, title }: { to: string; children?: ReactNode; title?: string }) {
  const open = useGame((s) => s.openPedia);
  return (
    <button
      type="button"
      className={children ? 'pedia-link text' : 'pedia-link'}
      title={title ?? 'Open in the Civilopedia'}
      aria-label={children ? undefined : 'Open in the Civilopedia'}
      onClick={(e) => {
        e.stopPropagation();
        open(to);
      }}
    >
      {children}
    </button>
  );
}

function Picture({ src, wide }: { src: string; wide?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return null;
  return <img className={wide ? 'pedia-banner' : 'pedia-art'} src={src} alt="" onError={() => setFailed(true)} />;
}

function Inline({ part, go }: { part: string | PediaLinkRef; go: (to: string) => void }) {
  if (typeof part === 'string') return <>{part}</>;
  const known = pediaEntry(part.to) !== undefined;
  return known ? (
    <a
      href={`#pedia/${part.to}`}
      onClick={(e) => {
        e.preventDefault();
        go(part.to);
      }}
    >
      {part.label}
    </a>
  ) : (
    <>{part.label}</>
  );
}

function Fact({ value, go }: { value: FactValue; go: (to: string) => void }) {
  if (Array.isArray(value))
    return (
      <>
        {value.map((v, i) => (
          <Fragment key={i}>
            {i > 0 && ', '}
            <Inline part={v} go={go} />
          </Fragment>
        ))}
      </>
    );
  if (typeof value === 'object') return <Inline part={value} go={go} />;
  return <>{value}</>;
}

/** Prose: paragraphs split on blank lines, runs of "- " lines as lists, links inline. */
function Prose({ text, go }: { text: string; go: (to: string) => void }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    let current: { list: boolean; lines: string[] } | null = null;
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const list = line.startsWith('- ');
      if (!current || current.list !== list) blocks.push((current = { list, lines: [] }));
      current.lines.push(list ? line.slice(2) : line);
    }
  }
  const inline = (t: string) => parseLinks(t).map((p, k) => <Inline key={k} part={p} go={go} />);
  return (
    <>
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i}>
            {b.lines.map((l, j) => (
              <li key={j}>{inline(l)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.lines.join(' '))}</p>
        ),
      )}
    </>
  );
}

function Page({ entry, go }: { entry: PediaEntry; go: (to: string) => void }) {
  return (
    <article className="pedia-page" aria-labelledby="pedia-title">
      {entry.art && entry.wideArt && <Picture src={entry.art} wide />}
      <header>
        {entry.art && !entry.wideArt && <Picture src={entry.art} />}
        <div>
          <h3 id="pedia-title">{entry.name}</h3>
          <div className="muted">{entry.subtitle}</div>
        </div>
      </header>
      {entry.facts.length > 0 && (
        <dl className="pedia-facts">
          {entry.facts.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>
                <Fact value={v} go={go} />
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <div className="pedia-text">{entry.text ? <Prose text={entry.text} go={go} /> : <p className="muted">No article yet.</p>}</div>
    </article>
  );
}

function Contents({ go }: { go: (to: string) => void }) {
  const entries = pediaEntries();
  return (
    <article className="pedia-page pedia-home">
      <Picture src={`${import.meta.env.BASE_URL}art/pedia/cover.jpg`} wide />
      <h3>Civilopedia</h3>
      <p>Everything in the game has a page here: every unit, building, wonder, advance and government, the land and its resources, the civilizations and the rules behind them. Numbers on these pages come straight from the rules the game plays by.</p>
      <h4>Start with the basics</h4>
      <ul className="pedia-start">
        {['cities', 'tiles', 'production', 'science', 'happiness', 'combat', 'automation', 'victory']
          .map((id) => entries.find((e) => e.key === `concepts/${id}`))
          .filter((e): e is PediaEntry => !!e)
          .map((e) => (
            <li key={e.key}>
              <a
                href={`#pedia/${e.key}`}
                onClick={(ev) => {
                  ev.preventDefault();
                  go(e.key);
                }}
              >
                {e.name}
              </a>{' '}
              <span className="muted">{e.subtitle}</span>
            </li>
          ))}
      </ul>
    </article>
  );
}

export function Civilopedia() {
  const key = useGame((s) => s.pedia);
  const open = useGame((s) => s.openPedia);
  const [history, setHistory] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const entry = key ? pediaEntry(key) : undefined;
  const [category, setCategory] = useState<PediaCategory>(entry?.category ?? 'concepts');
  const search = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (entry) setCategory(entry.category);
    page.current?.scrollTo(0, 0);
  }, [entry]);

  const go = (to: string) => {
    if (to === key) return;
    setHistory((h) => [...h, key ?? ''].slice(-50));
    setQuery('');
    open(to);
  };
  const back = () => {
    const prev = history.at(-1);
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    open(prev);
  };
  const close = () => open(null);

  // Escape closes the Civilopedia only, not the screen beneath it; Backspace goes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        close();
      } else if (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        back();
      } else if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = pediaEntries();
    if (q) return all.filter((e) => e.name.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q)).slice(0, 80);
    return all.filter((e) => e.category === category);
  }, [query, category]);

  return (
    <div className="dialog-backdrop pedia-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog panel wide pedia" role="dialog" aria-label="Civilopedia">
        <header>
          <button className="icon" aria-label="Back" title="Back (Backspace)" disabled={history.length === 0} onClick={back}>
            ‹
          </button>
          <h2>Civilopedia</h2>
          <input ref={search} type="search" placeholder="Search (/)" aria-label="Search the Civilopedia" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="icon" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <div className="pedia-body">
          <nav className="pedia-cats" aria-label="Categories">
            <button className={key === '' ? 'on' : ''} onClick={() => go('')}>
              Contents
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={!query && category === c.id ? 'on' : ''}
                aria-pressed={!query && category === c.id}
                onClick={() => {
                  setQuery('');
                  setCategory(c.id);
                }}
              >
                {c.name}
              </button>
            ))}
          </nav>
          <ul className="pedia-list" aria-label={query ? 'Search results' : 'Pages'}>
            {list.map((e) => (
              <li key={e.key}>
                <button className={e.key === key ? 'on' : ''} aria-current={e.key === key ? 'page' : undefined} onClick={() => go(e.key)}>
                  {e.name}
                  {query && <small className="muted"> · {CATEGORIES.find((c) => c.id === e.category)!.name}</small>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="muted">Nothing found.</li>}
          </ul>
          <div className="pedia-main" ref={page}>
            {entry ? <Page entry={entry} go={go} /> : <Contents go={go} />}
          </div>
        </div>
      </div>
    </div>
  );
}
