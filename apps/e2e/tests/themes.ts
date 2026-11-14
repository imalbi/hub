import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { RUN_TMP } from './hosts.ts';

/** The Aspetto picker is a radio group of rows; the radio is visually hidden, so click its row as a user would. */
export async function chooseTheme(page: Page, name: string) {
  await page.locator('fieldset label', { has: page.getByRole('radio', { name, exact: true }) }).click();
  await expect(page.getByRole('radio', { name, exact: true })).toBeChecked();
  await themeSettled(page);
}

/** Theme colors glide over --motion-standard; measuring contrast mid-glide would read blended colors. */
export async function themeSettled(page: Page) {
  await page.waitForFunction(() => document.documentElement.getAnimations().length === 0);
}

// The fake server reads this copy of the fixture (see `apps/server/src/testing/fake.ts`).
const schemePath = join(RUN_TMP, 'hub-e2e-caelestia-scheme.json');
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
