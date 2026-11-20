import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createNewsLive, parseDigestPage } from './page.ts';

const fixture = new URL('fixtures/latest.html', import.meta.url);

void test('the page gives its date, section counts, and headlines with fallback sources', () => {
  assert.deepEqual(parseDigestPage(readFileSync(fixture, 'utf8')), {
    date: '2026-11-04',
    sections: [
      { name: 'Svelte', count: 3 },
      { name: 'React', count: 12 },
      { name: 'Node', count: 0 },
      { name: 'Frontend', count: 7 },
    ],
    items: 22,
    headlines: [
      { title: 'Example item', source: 'Example issue', href: 'https://example.com/1' },
      { title: 'Example React release', source: 'React Blog', href: 'https://example.com/2' },
      { title: 'Example CSS guide', source: 'Web Dev', href: 'https://example.com/3' },
    ],
  });
  assert.equal(parseDigestPage('<html><body>no header</body></html>'), null);
});

void test('parseDigestPage decodes entities, excludes details, falls back cleanly, and rejects unsafe links', () => {
  const html = `
    <header><p>2026-11-20</p><nav><a href="#dev">Web<span>3</span></a></nav></header>
    <main>
      <section>
        <h2>Web</h2>
        <article>
          <h3>Source &amp; Blog<time>2026-11-20</time></h3>
          <ul>
            <li><small>Primary &quot;Feed&quot;</small><a href="https://example.com/a">A &amp; B&#x27;s Guide&#x9999999;</a><p>Summary ignored</p></li>
            <li><a href="javascript:alert(1)">Article &#8212; Fallback&#9999999;</a></li>
          </ul>
          <details><summary>More</summary><ul><li><a href="https://example.com/hidden">Hidden item</a></li></ul></details>
        </article>
        <article>
          <h3></h3>
          <ul>
            <li>Plain text item without link</li>
          </ul>
        </article>
      </section>
    </main>
  `;
  const parsed = parseDigestPage(html);
  assert.deepEqual(parsed?.headlines, [
    { title: "A & B's Guide", source: 'Primary "Feed"', href: 'https://example.com/a' },
    { title: 'Article — Fallback', source: 'Source & Blog', href: null },
    { title: 'Plain text item without link', source: 'Web', href: null },
  ]);
});

void test('unconfigured, missing or unknown pages are null; a run with nothing new is not fresh', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-news-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const page = join(dir, 'latest.html');
  const stateFile = join(dir, 'state.json');
  assert.equal(await createNewsLive({}).read(), null);
  assert.equal(await createNewsLive({ page }).read(), null);
  copyFileSync(fixture, page);
  writeFileSync(stateFile, '{}');
  const live = createNewsLive({ page, stateFile });
  assert.equal((await live.read())?.items, 22);
  assert.equal((await live.read())?.fresh, true);
  // The digest ran again an hour later and found nothing: the state file moved, the page did not.
  const later = new Date(Date.now() + 3_600_000);
  utimesSync(stateFile, later, later);
  assert.equal((await live.read())?.fresh, false);
  assert.equal((await live.read())?.refreshedAt, later.getTime());
  writeFileSync(page, '<html>new layout</html>');
  utimesSync(page, later, new Date(Date.now() + 7_200_000));
  assert.equal(await live.read(), null);
});
