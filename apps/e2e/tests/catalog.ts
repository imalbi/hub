import type { APIRequestContext, Locator } from '@playwright/test';
import { expect } from './fixtures.ts';
import { SERVER_URL } from './hosts.ts';

export const CATALOG_URL = 'https://example.com/hub-modules.git';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
export async function catalogState(pc: APIRequestContext) {
  const body: unknown = await (await pc.get('/trpc/catalog.state')).json();
  if (!isRecord(body) || !isRecord(body.result) || !isRecord(body.result.data)) throw new Error('Not a catalog state');
  const data = body.result.data;
  if (!Array.isArray(data.sources) || !Array.isArray(data.installed)) throw new Error('Catalog lists missing');
  return {
    pendingApply: data.pendingApply === true,
    canRestart: data.canRestart === true,
    sources: data.sources.flatMap((source): { id: string }[] =>
      isRecord(source) && typeof source.id === 'string' ? [{ id: source.id }] : [],
    ),
    installed: data.installed.flatMap((module): { name: string }[] =>
      isRecord(module) && typeof module.name === 'string' ? [{ name: module.name }] : [],
    ),
  };
}
export async function catalogControl(pc: APIRequestContext, data: Record<string, unknown>) {
  await pc.post(`${SERVER_URL}/__fake/catalog`, { data });
}
export async function hold(button: Locator) {
  await button.focus();
  await button.press('Space', { delay: 1000 });
}
export async function cleanCatalog(pc: APIRequestContext) {
  await catalogControl(pc, {
    version: '1.0.0',
    failSync: false,
    failBuild: false,
    hideDemo: false,
    manualRestart: true,
  });
  await expect
    .poll(async () => (await catalogState(pc).catch(() => null))?.canRestart, { timeout: 30_000 })
    .toBe(false);
  const current = await catalogState(pc);
  for (const module of current.installed)
    expect((await pc.post('/trpc/catalog.remove', { data: { name: module.name, confirmed: true } })).ok()).toBe(true);
  for (const source of current.sources)
    expect((await pc.post('/trpc/catalog.removeSource', { data: { id: source.id, confirmed: true } })).ok()).toBe(true);
  if ((await catalogState(pc)).pendingApply) {
    await pc.post('/trpc/catalog.applyChanges', { data: {} });
    await expect
      .poll(async () => (await catalogState(pc).catch(() => null))?.pendingApply, { timeout: 30_000 })
      .toBe(false);
  }
  await pc.post(`${SERVER_URL}/__fake/jobs`, { data: { clear: true } });
  await catalogControl(pc, { manualRestart: false });
  await expect.poll(async () => (await catalogState(pc).catch(() => null))?.canRestart, { timeout: 30_000 }).toBe(true);
}
