import { stat, readFile } from 'node:fs/promises';
import { createLiveHub } from '../../core/live.ts';

// The digest writes this header (`render` in the owner's webdigest script): the date, then one nav link per section
// with its item count in a span. The counts are the reliable part; the items themselves are free-form HTML.
const headerDate = /<header>.*?<p>(\d{4}-\d{2}-\d{2})\b/s;
const navSection = /<a href="#[^"]*"\s*>\s*([^<]+?)\s*<span>(\d+)<\/span>\s*<\/a\s*>/g;
// A refresh with nothing new rewrites the state file but not the page; the page is older than this then.
const sameRunMs = 10_000;
const HEADLINES_LIMIT = 12;

export type NewsHeadline = { title: string; source: string; href: string | null };
export type NewsPage = {
  date: string | null;
  sections: { name: string; count: number }[];
  items: number;
  headlines: NewsHeadline[];
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  agrave: 'à',
  egrave: 'è',
  eacute: 'é',
  igrave: 'ì',
  ograve: 'ò',
  ugrave: 'ù',
};

const decodeCodePoint = (code: number) =>
  Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';

function decodeHtml(raw: string): string {
  return raw
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => decodeCodePoint(Number.parseInt(hex, 16)))
    .replaceAll(/&#(\d+);/g, (_, dec: string) => decodeCodePoint(Number.parseInt(dec, 10)))
    .replaceAll(/&([a-zA-Z]+);/g, (full, name: string) => NAMED_ENTITIES[name] ?? full);
}

const cleanText = (fragment: string) =>
  decodeHtml(fragment.replaceAll(/<[^>]*>/g, ''))
    .replaceAll(/\s+/g, ' ')
    .trim();

function safeHref(attrs: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  const url = decodeHtml((match?.[1] ?? match?.[2] ?? '').trim());
  return /^https?:\/\//i.test(url) ? url : null;
}

function parseHeadlines(html: string): NewsHeadline[] {
  const headlines: NewsHeadline[] = [];
  const sectionMatches = [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)];
  const sections = sectionMatches.length > 0 ? sectionMatches.map((match) => match[1] ?? '') : [html];

  for (const sectionBody of sections) {
    const sectionName = cleanText(sectionBody.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '');
    const articleMatches = [...sectionBody.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)];
    const articles = articleMatches.length > 0 ? articleMatches.map((match) => match[1] ?? '') : [sectionBody];

    for (const articleBody of articles) {
      const headingRaw = (articleBody.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '').replaceAll(
        /<time\b[^>]*>[\s\S]*?<\/time>/gi,
        '',
      );
      const articleSource = cleanText(headingRaw);
      const visibleArticle = articleBody.replaceAll(/<details\b[\s\S]*?<\/details>/gi, '');
      const firstList = visibleArticle.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? '';

      for (const itemMatch of firstList.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
        const item = itemMatch[1] ?? '';
        const smallSource = cleanText(item.match(/<small\b[^>]*>([\s\S]*?)<\/small>/i)?.[1] ?? '');
        const bodyWithoutMeta = item
          .replaceAll(/<small\b[^>]*>[\s\S]*?<\/small>/gi, '')
          .replaceAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi, '');
        const linkMatch = /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(bodyWithoutMeta);
        const title = cleanText(linkMatch ? (linkMatch[2] ?? '') : bodyWithoutMeta);
        if (!title) continue;
        headlines.push({
          title,
          source: smallSource || articleSource || sectionName,
          href: linkMatch ? safeHref(linkMatch[1] ?? '') : null,
        });
        if (headlines.length >= HEADLINES_LIMIT) return headlines;
      }
    }
  }
  return headlines;
}

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
    headlines: parseHeadlines(html),
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
