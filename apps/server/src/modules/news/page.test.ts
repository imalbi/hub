import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createNewsLive, parseDigestPage } from './page.ts';

const fixture = new URL('fixtures/latest.html', import.meta.url);

void test('the page gives its date and the count of each section', () => {
  assert.deepEqual(parseDigestPage(readFileSync(fixture, 'utf8')), {
    date: '2026-11-04',
    sections: [
      { name: 'Svelte', count: 3 },
      { name: 'React', count: 12 },
      { name: 'Node', count: 0 },
      { name: 'Frontend', count: 7 },
    ],
    items: 22,
  });
  assert.equal(parseDigestPage('<html><body>no header</body></html>'), null);
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
