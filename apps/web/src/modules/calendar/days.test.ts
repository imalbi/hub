import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalendarItem } from '../../lib/module-ui.ts';
import {
  agendaDays,
  agendaName,
  agendaDateText,
  entriesByDay,
  filterEntries,
  monthDays,
  shiftMonth,
  shiftSpan,
  shortSpan,
  SHOW_ALL,
  weekDays,
  weekTitle,
  type CalendarEvent,
} from './days.ts';

const event = (id: string, day: string, start: string | null = null): CalendarEvent => ({
  id,
  title: id,
  day,
  start,
  end: null,
  kind: 'event',
  person: null,
  source: 'desk',
});
const shift = (id: string, day: string, start: string, end: string, person = 'Persona A'): CalendarEvent => ({
  ...event(id, day, start),
  end,
  kind: 'shift',
  person,
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

void test('a week runs Monday to Sunday around any day, across months', () => {
  assert.deepEqual(weekDays('2026-11-15'), [
    '2026-11-09',
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
    '2026-11-15',
  ]);
  assert.equal(weekDays('2026-11-16')[0], '2026-11-16');
  assert.equal(weekTitle(weekDays('2026-11-18')), '16 - 22 novembre');
  assert.equal(weekTitle(weekDays('2026-10-28')), '26 ott - 1 nov');
});

void test('a shift reads as its person and a span, overnight too, and is ordered by its start', () => {
  assert.equal(shiftSpan('06:00', '14:00'), '6:00 - 14:00');
  assert.equal(shiftSpan('22:00', '06:00'), '22:00 - 6:00');
  assert.equal(shortSpan('06:00', '14:00'), '6-14');
  assert.equal(shortSpan('22:00', '06:00'), '22-6');
  assert.equal(shortSpan('06:30', '14:00'), '6:30-14');
  const days = entriesByDay(
    [shift('notte', '2026-11-17', '22:00', '06:00', 'Persona B'), event('visita', '2026-11-17', '10:00')],
    [],
  );
  const [first, second] = days.get('2026-11-17') ?? [];
  assert.deepEqual(
    [first?.id, second?.kind, second?.title, second?.span],
    ['event-visita', 'shift', 'Persona B', '22:00 - 6:00'],
  );
});

void test('the agenda lists only the days with items, from a day and for a limit', () => {
  const byDay = entriesByDay(
    [event('a', '2026-11-15', '09:00'), shift('b', '2026-11-16', '06:00', '14:00'), event('c', '2026-12-20')],
    [item('d', '2026-11-16', 'study'), item('e', '2026-11-14', 'note')],
  );
  assert.deepEqual(
    agendaDays(byDay, '2026-11-15', 30).map(({ day, entries }) => [day, entries.length]),
    [
      ['2026-11-15', 1],
      ['2026-11-16', 2],
    ],
  );
  // The limit counts days from the start, and a start later leaves the earlier days out.
  assert.equal(agendaDays(byDay, '2026-11-15', 2).length, 2);
  assert.equal(agendaDays(byDay, '2026-11-16', 30).length, 1);
  assert.equal(agendaDays(byDay, '2026-11-15', 36).length, 3);
  const words = { today: 'Oggi', tomorrow: 'Domani' };
  assert.deepEqual(
    ['2026-11-15', '2026-11-16', '2026-11-17'].map((day) => agendaName(day, '2026-11-15', words)),
    ['Oggi', 'Domani', 'martedì'],
  );
  assert.deepEqual(
    ['2026-11-15', '2026-11-17'].map((day) => agendaDateText(day, '2026-11-15')),
    ['dom 15 nov', '17 nov'],
  );
});

void test('Mostra hides a kind in the week and the agenda; own events stay', () => {
  const days = entriesByDay(
    [event('visita', '2026-11-17'), shift('turno', '2026-11-17', '06:00', '14:00')],
    [item('l', '2026-11-17', 'work'), item('s', '2026-11-17', 'study'), item('n', '2026-11-17', 'note')],
  );
  const all = days.get('2026-11-17') ?? [];
  assert.equal(filterEntries(all, SHOW_ALL).length, 5);
  assert.deepEqual(
    filterEntries(all, { ...SHOW_ALL, shift: false, note: false })
      .map(({ kind }) => kind)
      .toSorted(),
    ['event', 'study', 'work'],
  );
  assert.deepEqual(
    filterEntries(all, { work: false, study: false, shift: false, note: false }).map(({ kind }) => kind),
    ['event'],
  );
});
