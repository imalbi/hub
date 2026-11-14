import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDay } from './parse-day.ts';

// Saturday 14 November 2026.
const today = '2026-11-14';

void test('reads the words for near days', () => {
  assert.equal(parseDay('oggi', today), '2026-11-14');
  assert.equal(parseDay(' Domani ', today), '2026-11-15');
  assert.equal(parseDay('dopodomani', today), '2026-11-16');
});

void test('reads a weekday as the next one, never today', () => {
  assert.equal(parseDay('venerdì', today), '2026-11-20');
  assert.equal(parseDay('ven', today), '2026-11-20');
  assert.equal(parseDay('sabato', today), '2026-11-21');
  assert.equal(parseDay('il prossimo lunedì', today), '2026-11-16');
});

void test('reads spans from today', () => {
  assert.equal(parseDay('tra 3 giorni', today), '2026-11-17');
  assert.equal(parseDay('fra una settimana', today), '2026-11-21');
  assert.equal(parseDay('tra 2 mesi', today), '2027-01-14');
});

void test('reads a date, and one without a year is the next time it comes round', () => {
  assert.equal(parseDay('4 dic', today), '2026-12-04');
  assert.equal(parseDay('4 dicembre 2027', today), '2027-12-04');
  assert.equal(parseDay('10 nov', today), '2027-11-10');
  assert.equal(parseDay('4/12', today), '2026-12-04');
  assert.equal(parseDay('4/12/27', today), '2027-12-04');
  assert.equal(parseDay('2026-12-04', today), '2026-12-04');
});

void test('refuses what it cannot read or what does not exist', () => {
  assert.equal(parseDay('', today), null);
  assert.equal(parseDay('boh', today), null);
  assert.equal(parseDay('31 feb', today), null);
  assert.equal(parseDay('4 xyz', today), null);
});
