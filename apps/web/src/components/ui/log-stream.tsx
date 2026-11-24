// Hairline UI · log-stream · MIT License
// Copyright (c) 2026 Hairline UI · https://hairlineui.com/license#components

'use client';

// The scroll region must receive keyboard and pointer input for accessible log navigation.
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */

import * as React from 'react';
import { ArrowDownIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { NumberRoll } from './number-roll.tsx';
import { TextMorph } from './text-morph.tsx';

/* ─────────────────────────────────────────────────────────
 * LOG STREAM: a live tail you can actually read
 *
 *   tail      lines arrive in batches, one render per frame
 *             however fast they come, and the view stays
 *             pinned to the newest line
 *   read      scroll up and the view lets go: lines keep
 *             arriving underneath, and a "↓ 128 new" pill rises
 *             with its count rolling; one tap takes you back
 *             down and pins it again
 *   pause     Live → Paused holds new lines back without
 *             losing them ("Paused · 42 waiting"); Live plays
 *             them in
 *   filter    level chips count as lines arrive and hide what
 *             you don't need; search marks every match ("/"
 *             focuses it)
 *   open      a line with data opens into its fields under it,
 *             by height, with Copy
 *   earlier   reach the top and older lines load in above
 *             without moving what you're reading
 *
 * Lines are plain records; subscribe() feeds them from SSE, a
 * WebSocket, Supabase Realtime or a poll.
 * ───────────────────────────────────────────────────────── */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DateLike = Date | string | number;

export interface LogLine {
  id: string;
  at: DateLike;
  level: LogLevel;
  message: string;
  /** Where it came from: "api", "worker", "cron". */
  source?: string;
  /** Fields shown when the line is opened. */
  data?: Record<string, unknown>;
}

export interface LogStreamProps extends Omit<React.HTMLAttributes<HTMLElement>, 'defaultValue'> {
  /** Lines to start with, oldest first. */
  defaultValue?: LogLine[];
  /** Starts the tail: call push with new lines; return a function that stops it. */
  subscribe?: (push: (lines: LogLine | LogLine[]) => void) => () => void;
  /** Loads lines older than the first one shown, oldest first; an empty list means there are no more. */
  loadEarlier?: (before: LogLine) => Promise<LogLine[]>;
  /** Lines kept in memory while you're at the bottom. */
  max?: number;
  /** The scrolling area's height. */
  copy: {
    title: string;
    live: string;
    paused: string;
    waiting: string;
    newLines: string;
    search: string;
    levels: string;
    errors: string;
    warnings: string;
    info: string;
    debug: string;
    copied: string;
    copy: string;
    bottom: string;
    start: string;
    loading: string;
    earlier: string;
    noMatch: string;
    firstLine: string;
    resumed: (count: number) => string;
    held: string;
  };
}

const EASE = 'cubic-bezier(0.16,1,0.3,1)';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
const TONE: Record<LogLevel, string> = {
  error: 'text-danger',
  warn: 'text-muted-foreground',
  info: 'text-muted-foreground',
  debug: 'text-muted-foreground/60',
};
const TICK: Record<LogLevel, string> = {
  error: 'bg-danger',
  warn: 'bg-muted-foreground',
  info: 'bg-transparent',
  debug: 'bg-transparent',
};
const NONE: LogLine[] = [];

const reducedQuery = '(prefers-reduced-motion: reduce)';
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const useReducedMotion = () =>
  React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );

const toTime = (d: DateLike) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : new Date(d).getTime());
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const clock = (d: DateLike) => {
  const t = new Date(toTime(d));
  return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}.${pad(t.getMilliseconds(), 3)}`;
};

/** The message with every match marked. */
function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  let at = lower.indexOf(q);
  while (at !== -1) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <mark key={at} className="rounded-[3px] bg-primary/15 text-inherit">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
    at = lower.indexOf(q, i);
  }
  parts.push(text.slice(i));
  return <>{parts}</>;
}

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">{String(v)}</span>;
  if (typeof v === 'number' || typeof v === 'boolean') return <span className="text-primary">{String(v)}</span>;
  if (typeof v === 'string') return <span className="text-foreground">&quot;{v}&quot;</span>;
  return <span className="text-foreground">{JSON.stringify(v)}</span>;
}

interface RowProps {
  line: LogLine;
  open: boolean;
  query: string;
  enter: boolean;
  reduced: boolean;
  toggle: (id: string) => void;
  copy: LogStreamProps['copy'];
}

const Row = React.memo(function Row({ line, open, query, enter, reduced, toggle, copy }: RowProps) {
  const ref = React.useRef<HTMLLIElement>(null);
  const [copied, setCopied] = React.useState(false);
  const has = Boolean(line.data && Object.keys(line.data).length);

  React.useLayoutEffect(() => {
    if (enter && !reduced)
      ref.current?.animate(
        [
          { opacity: 0, filter: 'blur(2px)' },
          { opacity: 1, filter: 'blur(0px)' },
        ],
        { duration: 260, easing: EASE },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLine() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            at: new Date(toTime(line.at)).toISOString(),
            level: line.level,
            source: line.source,
            message: line.message,
            ...line.data,
          },
          null,
          2,
        ),
      );
      setCopied(true);
    } catch {
      // The fields remain available for selection.
    }
  }

  const head = (
    <>
      <span
        aria-hidden="true"
        className={`absolute top-2xs bottom-2xs left-0 w-3xs rounded-full ${TICK[line.level]}`}
      />
      <time
        dateTime={new Date(toTime(line.at)).toISOString()}
        className="hidden w-label-col shrink-0 text-muted-foreground tabular-nums @md:block"
      >
        {clock(line.at)}
      </time>
      <span className={`w-xl shrink-0 uppercase ${TONE[line.level]}`}>
        {line.level === 'error' ? 'err' : line.level}
      </span>
      {line.source && (
        <span className="hidden w-3xl shrink-0 truncate text-muted-foreground @sm:block">{line.source}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-foreground">
        <Marked text={line.message} query={query} />
      </span>
    </>
  );

  return (
    <li ref={ref} className="[contain-intrinsic-size:auto_28px] [content-visibility:auto]">
      {has ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => toggle(line.id)}
          className={`relative flex h-xl w-full cursor-pointer items-center gap-sm rounded-sm pr-xs pl-sm text-left transition-colors hover:bg-muted ${open ? 'bg-muted' : ''} ${FOCUS}`}
        >
          {head}
        </button>
      ) : (
        <div className="relative flex h-xl items-center gap-sm pr-xs pl-sm">{head}</div>
      )}
      {has && (
        <div
          className="grid"
          inert={!open}
          style={{
            gridTemplateRows: open ? '1fr' : '0fr',
            transition: reduced ? 'none' : `grid-template-rows 320ms ${EASE}`,
          }}
        >
          <div className="min-h-0 min-w-0 overflow-clip">
            {open && (
              <div className="relative my-2xs ml-sm rounded-sm px-sm py-xs shadow-[inset_0_0_0_1px_var(--border)] @md:ml-4xl">
                <button
                  type="button"
                  onClick={() => void copyLine()}
                  className={`absolute top-2xs right-2xs h-lg cursor-pointer rounded-full px-xs font-sans text-caption font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${FOCUS}`}
                >
                  <TextMorph>{copied ? copy.copied : copy.copy}</TextMorph>
                </button>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-sm gap-y-3xs pr-2xl">
                  {Object.entries(line.data!).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 break-all">
                        <Value v={v} />
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
});

export function LogStream({
  defaultValue = NONE,
  subscribe,
  loadEarlier,
  max = 500,
  copy,
  className = '',
  style,
  ...props
}: LogStreamProps) {
  const title = copy.title;
  const names: Record<LogLevel, string> = {
    error: copy.errors,
    warn: copy.warnings,
    info: copy.info,
    debug: copy.debug,
  };
  const reduced = useReducedMotion();
  const id = React.useId();
  const [lines, setLines] = React.useState<LogLine[]>(defaultValue);
  const [paused, setPaused] = React.useState(false);
  const [held, setHeld] = React.useState(0);
  const [below, setBelow] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [shown, setShown] = React.useState<Set<LogLevel>>(() => new Set(LEVELS));
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const [loading, setLoading] = React.useState(false);
  const [noMore, setNoMore] = React.useState(!loadEarlier);
  const [fresh, setFresh] = React.useState<Set<string>>(() => new Set());
  const [announce, setAnnounce] = React.useState('');

  const viewRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const incoming = React.useRef<LogLine[]>([]);
  const holding = React.useRef<LogLine[]>([]);
  const frame = React.useRef(0);
  const stuck = React.useRef(true);
  const intent = React.useRef(0);
  const keep = React.useRef<number | null>(null);
  const pausedRef = React.useRef(paused);
  const linesRef = React.useRef(lines);
  React.useLayoutEffect(() => {
    pausedRef.current = paused;
    linesRef.current = lines;
  });

  // Stable, so the memoised rows don't re-render when it's passed down.
  const toggle = React.useCallback(
    (lineId: string) =>
      setOpen((o) => {
        const next = new Set(o);
        if (next.has(lineId)) next.delete(lineId);
        else next.add(lineId);
        return next;
      }),
    [],
  );

  // New lines wait for the next frame, so a burst is one render.
  const flush = React.useCallback(() => {
    frame.current = 0;
    const batch = incoming.current;
    incoming.current = [];
    if (!batch.length) return;
    setLines((prev) => {
      const next = prev.concat(batch);
      // Trim only while pinned to the bottom, so lines never vanish from under someone reading.
      return stuck.current && next.length > max ? next.slice(next.length - max) : next;
    });
    setFresh(batch.length <= 12 ? new Set(batch.map((l) => l.id)) : new Set());
    if (!stuck.current) setBelow((b) => b + batch.length);
  }, [max]);

  const push = React.useCallback(
    (input: LogLine | LogLine[]) => {
      const list = Array.isArray(input) ? input : [input];
      if (pausedRef.current) {
        holding.current.push(...list);
        setHeld(holding.current.length);
        return;
      }
      incoming.current.push(...list);
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  React.useEffect(() => {
    if (!subscribe) return;
    const stop = subscribe(push);
    return () => {
      stop();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [subscribe, push]);

  // Pinned: every commit ends on the newest line. Loading earlier: the line you were reading stays put.
  React.useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (keep.current !== null) {
      view.scrollTop += view.scrollHeight - keep.current;
      keep.current = null;
      return;
    }
    if (stuck.current) view.scrollTop = view.scrollHeight;
  }, [lines, shown, query]);

  const onScroll = () => {
    const view = viewRef.current;
    if (!view) return;
    const atBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 24;
    if (atBottom) {
      stuck.current = true;
      setBelow(0);
    } else if (performance.now() - intent.current < 900) {
      // Only a scroll the reader made lets go; content changing size doesn't.
      stuck.current = false;
    }
  };
  const meant = () => (intent.current = performance.now());

  const toBottom = () => {
    const view = viewRef.current;
    if (!view) return;
    stuck.current = true;
    setBelow(0);
    view.scrollTo({ top: view.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  };

  const setLive = (live: boolean) => {
    setPaused(!live);
    if (live) {
      const waiting = holding.current;
      holding.current = [];
      setHeld(0);
      if (waiting.length) {
        incoming.current.push(...waiting);
        if (!frame.current) frame.current = requestAnimationFrame(flush);
      }
      setAnnounce(waiting.length ? copy.resumed(waiting.length) : copy.live);
    } else setAnnounce(copy.held);
  };

  // Older lines, when the top comes into view.
  React.useEffect(() => {
    const el = sentinelRef.current;
    const view = viewRef.current;
    if (!el || !view || !loadEarlier || noMore) return;
    const fetchEarlier = loadEarlier;
    async function loadVisible(entry: IntersectionObserverEntry | undefined) {
      if (!entry?.isIntersecting || loading) return;
      const first = linesRef.current[0];
      if (!first) return;
      setLoading(true);
      try {
        const older = await fetchEarlier(first);
        if (!older.length) setNoMore(true);
        else {
          keep.current = viewRef.current?.scrollHeight ?? null;
          setFresh(new Set());
          setLines((prev) => older.concat(prev));
        }
      } finally {
        setLoading(false);
      }
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        void loadVisible(entry);
      },
      { root: view, rootMargin: '120px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadEarlier, noMore, loading]);

  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const counts = React.useMemo(() => {
    const c: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0 };
    for (const l of lines) c[l.level]++;
    return c;
  }, [lines]);
  const q = query.trim();
  const visible = React.useMemo(
    () =>
      lines.filter(
        (l) =>
          shown.has(l.level) &&
          (!q ||
            l.message.toLowerCase().includes(q.toLowerCase()) ||
            l.source?.toLowerCase().includes(q.toLowerCase())),
      ),
    [lines, shown, q],
  );

  return (
    <section
      aria-label={title}
      // Chromium does not cut a child's scrollbar at the parent's rounded overflow clip; clip-path does.
      style={{ clipPath: 'inset(0 round var(--radius-xl))', ...style }}
      className={`@container flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground ${className}`}
      onKeyDown={(e) => {
        if (e.key === '/' && document.activeElement !== searchRef.current) {
          e.preventDefault();
          searchRef.current?.focus();
        } else if (e.key === 'Escape' && document.activeElement === searchRef.current && query) {
          setQuery('');
        }
      }}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-xs border-b border-border px-sm py-sm @md:px-md">
        <button
          type="button"
          aria-pressed={!paused}
          onClick={() => setLive(paused)}
          className={`inline-flex h-xl shrink-0 cursor-pointer items-center gap-xs rounded-full px-sm text-caption font-medium shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-muted ${FOCUS}`}
        >
          <span className="relative grid size-xs place-items-center" aria-hidden="true">
            <span
              className={`size-2xs rounded-full transition-colors duration-300 ${paused ? 'bg-muted-foreground' : 'bg-success'}`}
            />
            {!paused && !reduced && (
              <span className="absolute inset-0 animate-[ui-ping_1.6s_ease-out_infinite] rounded-full bg-success opacity-40" />
            )}
          </span>
          <TextMorph>{paused ? copy.paused : copy.live}</TextMorph>
          <span
            aria-hidden={!(paused && held) || undefined}
            className="-ml-xs inline-grid text-muted-foreground"
            style={{
              gridTemplateColumns: paused && held ? '1fr' : '0fr',
              opacity: paused && held ? 1 : 0,
              transition: reduced ? 'none' : `grid-template-columns 380ms ${EASE}, opacity 240ms ${EASE}`,
            }}
          >
            <span className="min-w-0 [clip-path:inset(-4px_0)]">
              <span className="inline-flex items-baseline pl-xs font-normal whitespace-nowrap tabular-nums">
                ·&nbsp;
                <NumberRoll value={held || 1} />
                &nbsp;{copy.waiting}
              </span>
            </span>
          </span>
        </button>

        <label className="flex h-xl min-w-4xl flex-1 items-center gap-2xs rounded-full px-sm shadow-[inset_0_0_0_1px_var(--border)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--ring)]">
          <MagnifyingGlassIcon className="size-md shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">
            {copy.search} {title}
          </span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.search}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden [@media(pointer:fine)]:text-caption"
          />
          <kbd
            aria-hidden="true"
            className="hidden rounded-sm px-2xs font-mono text-caption text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] [@media(pointer:fine)]:block"
          >
            /
          </kbd>
        </label>

        <fieldset
          aria-label={copy.levels}
          className="-mx-2xs flex max-w-full [scrollbar-width:none] items-center gap-2xs overflow-x-auto px-2xs @lg:mx-0 @lg:px-0"
        >
          {LEVELS.map((lv) => {
            const on = shown.has(lv);
            return (
              <button
                key={lv}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setShown((s) => {
                    const next = new Set(s);
                    if (next.has(lv)) next.delete(lv);
                    else next.add(lv);
                    return next;
                  })
                }
                className={`inline-flex h-xl shrink-0 cursor-pointer items-center gap-2xs rounded-full px-sm text-caption font-medium whitespace-nowrap transition-[background-color,color,box-shadow,opacity] duration-200 ${FOCUS} ${
                  on
                    ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
                    : 'text-muted-foreground opacity-60 hover:opacity-100'
                }`}
              >
                {(lv === 'error' || lv === 'warn') && (
                  <span aria-hidden="true" className={`size-2xs rounded-full ${TICK[lv]}`} />
                )}
                {names[lv]}
                <span className="font-normal text-muted-foreground tabular-nums">
                  <NumberRoll value={counts[lv]} />
                </span>
              </button>
            );
          })}
        </fieldset>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <section
          ref={viewRef}
          onScroll={onScroll}
          onWheel={meant}
          onTouchMove={meant}
          onKeyDown={meant}
          onPointerDown={(e) => e.target === e.currentTarget && meant()}
          tabIndex={0}
          aria-label={`${title}, ${copy.bottom}`}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-2xs pt-2xs pb-lg font-mono text-caption @md:px-xs ${FOCUS} focus-visible:ring-inset`}
        >
          <div ref={sentinelRef} aria-hidden="true" className="h-px" />
          {loadEarlier && (
            <p className="flex h-xl items-center justify-center gap-xs font-sans text-caption text-muted-foreground">
              {noMore ? copy.start : loading ? copy.loading : copy.earlier}
            </p>
          )}
          <ul aria-label={title} id={`${id}-list`}>
            {visible.map((l) => (
              <Row
                key={l.id}
                line={l}
                open={open.has(l.id)}
                query={q}
                enter={fresh.has(l.id)}
                reduced={reduced}
                toggle={toggle}
                copy={copy}
              />
            ))}
          </ul>
          {!visible.length && (
            <p className="flex h-4xl items-center justify-center font-sans text-caption text-muted-foreground">
              {lines.length ? copy.noMatch : paused ? copy.paused : copy.firstLine}
            </p>
          )}
        </section>

        {/* Lines that arrived while you were reading further up. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-sm flex justify-center">
          <button
            type="button"
            onClick={toBottom}
            tabIndex={below ? 0 : -1}
            aria-hidden={!below || undefined}
            className={`pointer-events-auto inline-flex h-xl cursor-pointer items-center gap-2xs rounded-full bg-background px-sm text-caption font-medium shadow-[inset_0_0_0_1px_var(--border)] transition-[transform,opacity] hover:bg-muted ${FOCUS} ${below ? '' : 'pointer-events-none'}`}
            style={{
              opacity: below ? 1 : 0,
              transform: below ? 'none' : 'translateY(10px) scale(0.96)',
              transitionDuration: reduced ? '0ms' : '420ms',
              transitionTimingFunction: EASE,
            }}
          >
            <ArrowDownIcon className="size-md" aria-hidden="true" />
            <span className="inline-flex items-baseline tabular-nums">
              <NumberRoll value={below || 1} />
              &nbsp;{copy.newLines}
            </span>
          </button>
        </div>
      </div>

      <output className="sr-only">{announce}</output>
    </section>
  );
}
