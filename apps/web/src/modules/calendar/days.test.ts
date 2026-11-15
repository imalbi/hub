import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalendarItem } from '../../lib/module-ui.ts';
import { entriesByDay, monthDays, shiftMonth, type CalendarEvent } from './days.ts';

const event = (id: string, day: string, start: string | null = null): CalendarEvent => ({
  id,
  title: id,
  day,
  start,
  end: null,
  source: 'desk',
});
const item = (id: string, day: string, kind: CalendarItem['kind'], time?: string): CalendarItem => ({
  id,
  day,
  title: id,
  kind,
  ...(time ? { time } : {}),
});

void test('the grid has 42 days, Monday first, with the month inside it', () => {
  const days = monthDays('2026-11');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2026-10-26');
  assert.equal(days[6], '2026-11-01');
  assert.equal(days[41], '2026-12-06');
  assert.equal(monthDays('2026-06')[0], '2026-06-01');
});

void test('months shift across a year', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

void test('contributions from notes, work and own events land on their day, in order, and a module with none adds nothing', () => {
  const days = entriesByDay(
    [event('dentista', '2026-11-19', '16:30'), event('cena', '2026-11-20')],
    [
      item('colloquio', '2026-11-19', 'work', '10:00'),
      item('scadenza', '2026-11-19', 'work'),
      item('postit', '2026-11-20', 'note'),
    ],
  );
  assert.deepEqual(
    days.get('2026-11-19')?.map(({ id }) => id),
    ['scadenza', 'colloquio', 'event-dentista'],
  );
  // At the same time (none) an own event leads the contributions.
  assert.deepEqual(
    days.get('2026-11-20')?.map(({ id }) => id),
    ['event-cena', 'postit'],
  );
  assert.equal(days.get('2026-11-21'), undefined);
  assert.equal(entriesByDay([], []).size, 0);
});
