import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expandSeries, type Series } from './series.ts';

const series: Series = {
  id: 'weekly',
  title: 'Turno',
  kind: 'shift',
  person: 'Persona A',
  source: 'desk',
  fromDay: '2026-11-16',
  untilDay: null,
  days: [
    { weekday: 1, start: '09:00', end: '13:30' },
    { weekday: 2, start: '09:00', end: '17:00' },
    { weekday: 3, start: '09:30', end: '17:00' },
    { weekday: 4, start: '10:00', end: '13:00' },
    { weekday: 5, start: '09:00', end: '16:30' },
  ],
};

void test('expands the matching weekdays with their own times and unique ids', () => {
  const common = { title: 'Turno', kind: 'shift', person: 'Persona A', source: 'desk', seriesId: 'weekly' };
  assert.deepEqual(expandSeries(series, '2026-11-16', '2026-11-22', []), [
    {
      ...common,
      id: 'series:weekly:2026-11-16',
      day: '2026-11-16',
      seriesDay: '2026-11-16',
      start: '09:00',
      end: '13:30',
    },
    {
      ...common,
      id: 'series:weekly:2026-11-17',
      day: '2026-11-17',
      seriesDay: '2026-11-17',
      start: '09:00',
      end: '17:00',
    },
    {
      ...common,
      id: 'series:weekly:2026-11-18',
      day: '2026-11-18',
      seriesDay: '2026-11-18',
      start: '09:30',
      end: '17:00',
    },
    {
      ...common,
      id: 'series:weekly:2026-11-19',
      day: '2026-11-19',
      seriesDay: '2026-11-19',
      start: '10:00',
      end: '13:00',
    },
    {
      ...common,
      id: 'series:weekly:2026-11-20',
      day: '2026-11-20',
      seriesDay: '2026-11-20',
      start: '09:00',
      end: '16:30',
    },
  ]);
});

void test('honours bounds and skips and keeps overnight shifts on their start day', () => {
  assert.deepEqual(expandSeries(series, '2026-11-01', '2026-11-15', []), []);
  const overnight = {
    ...series,
    untilDay: '2026-11-18',
    days: [{ weekday: 1, start: '22:00', end: '01:00' }, ...series.days.slice(1)],
  };
  assert.deepEqual(
    expandSeries(overnight, '2026-11-16', '2026-11-22', ['2026-11-17']).map(({ day, end }) => [day, end]),
    [
      ['2026-11-16', '01:00'],
      ['2026-11-18', '17:00'],
    ],
  );
});
