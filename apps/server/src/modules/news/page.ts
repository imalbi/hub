import { stat, readFile } from 'node:fs/promises';
import { createLiveHub } from '../../core/live.ts';

// The digest writes this header (`render` in the owner's webdigest script): the date, then one nav link per section
// with its item count in a span. The counts are the reliable part; the items themselves are free-form HTML.
const headerDate = /<header>.*?<p>(\d{4}-\d{2}-\d{2})\b/s;
const navSection = /<a href="#[^"]*"\s*>\s*([^<]+?)\s*<span>(\d+)<\/span>\s*<\/a\s*>/g;
// A refresh with nothing new rewrites the state file but not the page; the page is older than this then.
const sameRunMs = 10_000;

export type NewsPage = { date: string | null; sections: { name: string; count: number }[]; items: number };

/** Null when the page has no header nav: a layout the parser does not know. */
export function parseDigestPage(html: string): NewsPage | null {
  const nav = html.match(/<nav>(.*?)<\/nav>/s)?.[1];
  if (nav === undefined) return null;
  const sections = [...nav.matchAll(navSection)].map(([, name = '', count = '0']) => ({
    name: name.trim(),
    count: Number(count),
  }));
  return {
    date: html.match(headerDate)?.[1] ?? null,
    sections,
    items: sections.reduce((total, section) => total + section.count, 0),
  };
}

export type NewsState = NewsPage & {
  /** When the digest last ran (its state file was written), ms. */
  refreshedAt: number | null;
  /** The last run found something: the page on disk is from it, so its items are new. */
  fresh: boolean;
};

/** Null when the module is not configured or the page is missing or unreadable: the UI hides news then. */
export function createNewsLive({ page, stateFile }: { page?: string; stateFile?: string }, intervalMs = 5000) {
  let cached: { mtimeMs: number; parsed: NewsPage | null } | undefined;
  async function read(): Promise<NewsState | null> {
    if (!page) return null;
    try {
      const { mtimeMs } = await stat(page);
      if (cached?.mtimeMs !== mtimeMs) cached = { mtimeMs, parsed: parseDigestPage(await readFile(page, 'utf8')) };
      if (!cached.parsed) return null;
      const refreshedAt = stateFile
        ? await stat(stateFile).then(
            (s) => Math.round(s.mtimeMs),
            () => null,
          )
        : null;
      return {
        ...cached.parsed,
        refreshedAt: refreshedAt ?? Math.round(mtimeMs),
        fresh: refreshedAt === null || refreshedAt - mtimeMs < sameRunMs,
      };
    } catch {
      cached = undefined;
      return null;
    }
  }
  return { read, ...createLiveHub(read, intervalMs) };
}

export type NewsLive = ReturnType<typeof createNewsLive>;
