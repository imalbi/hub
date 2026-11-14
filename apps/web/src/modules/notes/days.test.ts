import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, agentName, splitNotes, writtenOn, type Note } from './days.ts';

const note = (id: string, forDay: string, createdAt = new Date(2026, 10, 10, 9).getTime(), source = 'desk'): Note => ({
  id,
  text: id,
  forDay,
  source,
  createdAt,
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
