import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assistantPrompt } from './assistant-prompt.ts';

void test('provides the next seven local dates, including month boundaries', () => {
  const prompt = assistantPrompt(new Date(2026, 10, 16, 12));
  assert.match(prompt, /giovedì = 2026-11-19/);
  assert.equal(prompt.split('\n').filter((line) => line.includes(' = ')).length, 7);
  assert.match(assistantPrompt(new Date(2026, 10, 30, 12)), /martedì = 2026-12-01/);
});
