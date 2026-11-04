import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

/** The Aspetto picker is a radio group of preview cards; the radio is visually hidden, so click its name as a user would. */
export async function chooseTheme(page: Page, name: string) {
  await page.locator('fieldset label', { hasText: new RegExp(`^${name}$`) }).click();
  await expect(page.getByRole('radio', { name, exact: true })).toBeChecked();
}

// The fake server reads this copy of the fixture (see `apps/server/src/testing/fake.ts`).
const schemePath = join(tmpdir(), 'hub-e2e-caelestia-scheme.json');
const fixture = readFileSync(new URL('../../server/src/modules/theme/fixtures/scheme.json', import.meta.url), 'utf8');

/** Rewrites the fake Caelestia scheme; call `restoreScheme` in `finally`. */
export function writeScheme(change: (scheme: { mode: string; colours: Record<string, string> }) => void) {
  const scheme = JSON.parse(fixture);
  change(scheme);
  writeFileSync(schemePath, JSON.stringify(scheme));
}

export function restoreScheme() {
  writeFileSync(schemePath, fixture);
}
