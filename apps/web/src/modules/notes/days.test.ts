import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays } from '../../lib/day.ts';
import { agentName, groupBoardNotes, nearestNotes, noteDayLabel, splitNotes, writtenOn, type Note } from './days.ts';

const note = (id: string, forDay: string, createdAt = new Date(2026, 10, 10, 9).getTime(), source = 'desk'): Note => ({
  id,
  text: id,
  forDay,
  source,
  createdAt,
  about: null,
});

void test('a note for tomorrow is absent today, opens tomorrow and stays on the days after', () => {
  const notes = [note('a', '2026-11-15')];
  assert.deepEqual(splitNotes(notes, '2026-11-14').due, []);
  assert.deepEqual(
    splitNotes(notes, '2026-11-14').upcoming.map(({ id }) => id),
    ['a'],
  );
  assert.deepEqual(
    splitNotes(notes, '2026-11-15').due.map(({ id }) => id),
    ['a'],
  );
  assert.deepEqual(
    splitNotes(notes, '2026-11-20').due.map(({ id }) => id),
    ['a'],
  );
});

void test('notes for today come first, the older ones follow, upcoming ones go soonest first', () => {
  const notes = [
    note('old', '2026-11-12'),
    note('later', '2026-11-30'),
    note('today', '2026-11-14'),
    note('soon', '2026-11-16'),
  ];
  const { due, upcoming } = splitNotes(notes, '2026-11-14');
  assert.deepEqual(
    due.map(({ id }) => id),
    ['today', 'old'],
  );
  assert.deepEqual(
    upcoming.map(({ id }) => id),
    ['soon', 'later'],
  );
});

void test('days roll across month ends and the origin says when a note was written', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  const written = new Date(2026, 10, 13, 22).getTime();
  assert.deepEqual(writtenOn(note('x', '2026-11-14', written), '2026-11-14'), { kind: 'yesterday' });
  assert.deepEqual(writtenOn(note('x', '2026-11-14', written), '2026-11-13'), { kind: 'today' });
  assert.deepEqual(writtenOn(note('x', '2026-11-14', written), '2026-11-20'), { kind: 'day', day: '2026-11-13' });
  assert.equal(agentName(note('x', '2026-11-14', written, 'agent:Locale')), 'Locale');
  assert.equal(agentName(note('x', '2026-11-14', written)), null);
});

void test('noteDayLabel formats today/overdue, tomorrow, and short later days', () => {
  const words = { today: 'Oggi', tomorrow: 'Domani' };
  assert.equal(noteDayLabel('2026-11-12', '2026-11-14', words), 'Oggi');
  assert.equal(noteDayLabel('2026-11-14', '2026-11-14', words), 'Oggi');
  assert.equal(noteDayLabel('2026-11-15', '2026-11-14', words), 'Domani');
  assert.equal(noteDayLabel('2026-11-19', '2026-11-14', words), 'gio 19');
});

void test('nearestNotes picks up to 3 notes in today, overdue, tomorrow, then later order', () => {
  const notes = [
    note('old', '2026-11-12'),
    note('later', '2026-11-19'),
    note('today', '2026-11-14'),
    note('tomorrow', '2026-11-15'),
  ];
  assert.deepEqual(
    nearestNotes(notes, '2026-11-14').map(({ id }) => id),
    ['today', 'old', 'tomorrow'],
  );
  assert.deepEqual(
    nearestNotes([note('only', '2026-11-15')], '2026-11-14').map(({ id }) => id),
    ['only'],
  );
  assert.deepEqual(nearestNotes([], '2026-11-14'), []);
});

void test('groupBoardNotes caps each column at 3 and total at 6 without starving Domani', () => {
  const spread = [
    note('t1', '2026-11-14'),
    note('t2', '2026-11-14'),
    note('t3', '2026-11-14'),
    note('m1', '2026-11-15'),
    note('m2', '2026-11-15'),
    note('l1', '2026-11-18'),
    note('l2', '2026-11-19'),
    note('l3', '2026-11-20'),
  ];
  const groupedSpread = groupBoardNotes(spread, '2026-11-14');
  assert.deepEqual(
    groupedSpread.today.map(({ id }) => id),
    ['t1', 't2', 't3'],
  );
  assert.deepEqual(
    groupedSpread.tomorrow.map(({ id }) => id),
    ['m1', 'm2'],
  );
  assert.deepEqual(
    groupedSpread.later.map(({ id }) => id),
    ['l1'],
  );
  assert.equal(groupedSpread.remaining, 2);

  const todayHeavy = [
    note('t1', '2026-11-14'),
    note('t2', '2026-11-14'),
    note('t3', '2026-11-14'),
    note('t4', '2026-11-14'),
    note('t5', '2026-11-14'),
    note('m1', '2026-11-15'),
    note('m2', '2026-11-15'),
    note('l1', '2026-11-19'),
  ];
  const groupedHeavy = groupBoardNotes(todayHeavy, '2026-11-14');
  assert.equal(groupedHeavy.today.length, 3);
  assert.equal(groupedHeavy.tomorrow.length, 2);
  assert.equal(groupedHeavy.later.length, 1);
  assert.equal(groupedHeavy.remaining, 2);

  const allToday = Array.from({ length: 8 }, (_, index) => note(`d${index + 1}`, '2026-11-14'));
  const groupedSingle = groupBoardNotes(allToday, '2026-11-14');
  assert.equal(groupedSingle.today.length, 3);
  assert.equal(groupedSingle.tomorrow.length, 0);
  assert.equal(groupedSingle.later.length, 0);
  assert.equal(groupedSingle.remaining, 5);

  const empty = groupBoardNotes([], '2026-11-14');
  assert.deepEqual(empty, { today: [], tomorrow: [], later: [], remaining: 0 });
});
