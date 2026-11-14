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

void test('the words for the past read the same in both directions', () => {
  assert.equal(parseDay('ieri', today), '2026-11-13');
  assert.equal(parseDay("l'altro ieri", today), '2026-11-12');
  assert.equal(parseDay('l’altro ieri', today, 'past'), '2026-11-12');
  assert.equal(parseDay('3 giorni fa', today, 'past'), '2026-11-11');
  assert.equal(parseDay('una settimana fa', today, 'past'), '2026-11-07');
  assert.equal(parseDay('2 settimane fa', today, 'past'), '2026-10-31');
  assert.equal(parseDay('un mese fa', today, 'past'), '2026-10-14');
  assert.equal(parseDay('lunedì scorso', today, 'past'), '2026-11-09');
  assert.equal(parseDay('sabato scorso', today), '2026-11-07');
});

void test('past: a weekday or a date without a year is the last time it came round', () => {
  assert.equal(parseDay('lun', today, 'past'), '2026-11-09');
  assert.equal(parseDay('sabato', today, 'past'), '2026-11-07', 'never today');
  assert.equal(parseDay('10 nov', today, 'past'), '2026-11-10');
  assert.equal(parseDay('14 nov', today, 'past'), '2026-11-14');
  assert.equal(parseDay('20 nov', today, 'past'), '2025-11-20');
  assert.equal(parseDay('20/11', today, 'past'), '2025-11-20');
  assert.equal(parseDay('4 nov 2024', today, 'past'), '2024-11-04');
});
