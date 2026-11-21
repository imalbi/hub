import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { buildServer } from '../../server.ts';
import { createFakeDesktop } from '../../testing/fake-desktop.ts';

process.env.NODE_ENV = 'test';

const LAN = '192.0.2.7';
const eventList = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    day: z.string(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    kind: z.enum(['event', 'shift']),
    person: z.string().nullable(),
    source: z.string(),
    seriesId: z.string().nullable(),
    seriesDay: z.string().nullable(),
  }),
);

function open() {
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  const call = (path: string, payload: object, extra: { remoteAddress?: string; token?: string } = {}) =>
    app.inject({
      method: 'POST',
      url: `/trpc/${path}`,
      remoteAddress: extra.remoteAddress,
      headers: {
        'content-type': 'application/json',
        ...(extra.token ? { authorization: `Bearer ${extra.token}` } : {}),
      },
      payload,
    });
  const range = async (from: string, to: string, extra: { remoteAddress?: string; token?: string } = {}) => {
    const res = await app.inject({
      method: 'GET',
      url: `/trpc/calendar.range?input=${encodeURIComponent(JSON.stringify({ from, to }))}`,
      remoteAddress: extra.remoteAddress,
      headers: extra.token ? { authorization: `Bearer ${extra.token}` } : {},
    });
    return { status: res.statusCode, events: res.statusCode === 200 ? eventList.parse(res.json().result.data) : [] };
  };
  return { app, call, range };
}

void test('events are added, changed, removed and restored; bad input is refused', async (t) => {
  const { app, call, range } = open();
  t.after(() => app.close());
  assert.equal(
    (await call('calendar.add', { title: '  Dentista ', day: '2026-11-18', start: '16:30' })).statusCode,
    200,
  );
  assert.equal(
    (await call('calendar.add', { title: 'Cena', day: '2026-11-18', start: '08:00', end: '09:30' })).statusCode,
    200,
  );
  assert.equal((await call('calendar.add', { title: 'Giornata', day: '2026-11-18' })).statusCode, 200);
  assert.equal((await call('calendar.add', { title: 'Fuori', day: '2026-12-01' })).statusCode, 200);
  const { events } = await range('2026-11-01', '2026-11-30');
  // A day with no time leads, then by start time.
  assert.deepEqual(
    events.map(({ title, start }) => [title, start]),
    [
      ['Giornata', null],
      ['Cena', '08:00'],
      ['Dentista', '16:30'],
    ],
  );
  assert.equal(events[0]?.source, 'desk');
  for (const bad of [
    { title: '   ', day: '2026-11-18' },
    { title: 'x'.repeat(121), day: '2026-11-18' },
    { title: 'ok', day: '2026-02-30' },
    { title: 'ok', day: '2026-11-18', start: '25:00' },
    { title: 'ok', day: '2026-11-18', start: '9:00' },
    { title: 'ok', day: '2026-11-18', start: '10:00', end: '10:00' },
    { title: 'ok', day: '2026-11-18', start: '10:00', end: '09:00' },
    { title: 'ok', day: '2026-11-18', end: '09:00' },
  ])
    assert.equal((await call('calendar.add', bad)).statusCode, 400, JSON.stringify(bad));
  const dentist = events.find((event) => event.title === 'Dentista');
  assert.ok(dentist);
  assert.equal(
    (
      await call('calendar.update', {
        id: dentist.id,
        title: 'Dentista',
        day: '2026-11-19',
        start: '17:00',
        end: '18:00',
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(
    (await range('2026-11-19', '2026-11-19')).events.map(({ title, start, end }) => [title, start, end]),
    [['Dentista', '17:00', '18:00']],
  );
  assert.equal((await call('calendar.remove', { id: dentist.id })).statusCode, 200);
  assert.equal((await range('2026-11-19', '2026-11-19')).events.length, 0);
  assert.equal((await call('calendar.restore', { id: dentist.id })).statusCode, 200);
  assert.equal((await range('2026-11-19', '2026-11-19')).events.length, 1);
  assert.equal((await call('calendar.remove', { id: 'missing' })).statusCode, 404);
});

void test('a shift keeps a person and may run past midnight; the range returns kind and person', async (t) => {
  const { app, call, range } = open();
  t.after(() => app.close());
  const night = {
    kind: 'shift',
    title: 'Turno',
    person: ' Persona A ',
    day: '2026-11-18',
    start: '22:00',
    end: '06:00',
  };
  assert.equal((await call('calendar.add', night)).statusCode, 200);
  assert.equal((await call('calendar.add', { ...night, start: '08:00', end: '08:00' })).statusCode, 200);
  assert.equal((await call('calendar.add', { title: 'Dentista', day: '2026-11-18', start: '09:00' })).statusCode, 200);
  const { events } = await range('2026-11-18', '2026-11-18');
  assert.deepEqual(
    events.map(({ kind, person, start, end }) => [kind, person, start, end]),
    [
      ['shift', 'Persona A', '08:00', '08:00'],
      ['event', null, '09:00', null],
      ['shift', 'Persona A', '22:00', '06:00'],
    ],
  );
  const shift = events[2];
  assert.ok(shift);
  assert.equal(
    (await call('calendar.update', { ...night, id: shift.id, person: 'Persona B', start: '23:00', end: '07:00' }))
      .statusCode,
    200,
  );
  assert.deepEqual(
    (await range('2026-11-18', '2026-11-18')).events
      .filter(({ kind }) => kind === 'shift')
      .map(({ person, start }) => [person, start]),
    [
      ['Persona A', '08:00'],
      ['Persona B', '23:00'],
    ],
  );
  // An update that does not name the kind keeps it: an agent changing a shift's hours must not turn it into an event.
  assert.equal(
    (await call('calendar.update', { id: shift.id, title: 'Turno', day: '2026-11-18', start: '21:00', end: '05:00' }))
      .statusCode,
    200,
  );
  const kept = (await range('2026-11-18', '2026-11-18')).events.find(({ id }) => id === shift.id);
  assert.deepEqual([kept?.kind, kept?.person, kept?.start], ['shift', 'Persona B', '21:00']);
  // Still a shift, so it still needs its end.
  assert.equal(
    (await call('calendar.update', { id: shift.id, title: 'Turno', day: '2026-11-18', start: '21:00' })).statusCode,
    400,
  );
  // Naming the kind turns it into an event, which keeps no person even when one is sent.
  assert.equal(
    (
      await call('calendar.update', {
        id: shift.id,
        kind: 'event',
        title: 'Cena',
        day: '2026-11-18',
        person: 'Persona C',
      })
    ).statusCode,
    200,
  );
  const turned = (await range('2026-11-18', '2026-11-18')).events.find(({ id }) => id === shift.id);
  assert.deepEqual([turned?.kind, turned?.person], ['event', null]);
  for (const bad of [
    { ...night, person: undefined },
    { ...night, person: '  ' },
    { ...night, person: 'x'.repeat(61) },
    { ...night, end: undefined },
    { ...night, start: undefined },
    { ...night, kind: 'meeting' },
  ])
    assert.equal((await call('calendar.add', bad)).statusCode, 400, JSON.stringify(bad));
  // Events still refuse an end before the start.
  assert.equal(
    (await call('calendar.add', { title: 'x', day: '2026-11-18', start: '10:00', end: '09:00' })).statusCode,
    400,
  );
});

void test('an agent adds an event over MCP and its source names the agent', async (t) => {
  const { app, range } = open();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { accept: 'application/json, text/event-stream' },
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'calendar.add', arguments: { title: 'Colloquio', day: '2026-11-20', start: '10:00' } },
    },
  });
  assert.equal(response.statusCode, 200);
  const [event] = (await range('2026-11-20', '2026-11-20')).events;
  assert.equal(event?.title, 'Colloquio');
  assert.equal(event?.source, 'agent:Locale');
});

void test('a paired phone reads the range but cannot write', async (t) => {
  const { app, call, range } = open();
  t.after(() => app.close());
  await call('calendar.add', { title: 'Visita', day: '2026-11-20' });
  const code = z
    .object({ result: z.object({ data: z.object({ code: z.string() }) }) })
    .parse((await call('pairing.createCode', {})).json()).result.data.code;
  const redeemed = await call('pairing.redeem', { code, deviceName: 'Test phone' }, { remoteAddress: LAN });
  const token = z.object({ result: z.object({ data: z.object({ token: z.string() }) }) }).parse(redeemed.json()).result
    .data.token;
  const phone = { remoteAddress: LAN, token };
  assert.equal((await range('2026-11-20', '2026-11-20', phone)).events.length, 1);
  assert.equal((await call('calendar.add', { title: 'Nope', day: '2026-11-20' }, phone)).statusCode, 403);
  assert.equal((await range('2026-11-20', '2026-11-20', { remoteAddress: LAN })).status, 401);
});

void test('weekly series validate rules and support occurrence edits, removal and restoration', async (t) => {
  const { app, call, range } = open();
  t.after(() => app.close());
  const input = {
    title: 'Turno',
    kind: 'shift',
    person: 'Persona A',
    fromDay: '2026-11-16',
    untilDay: null,
    days: [
      { weekday: 1, start: '09:00', end: '13:30' },
      { weekday: 2, start: '09:00', end: '17:00' },
    ],
  };
  assert.equal(
    (await call('calendar.addSeries', { ...input, days: [{ weekday: 1, start: '09:00', end: null }] })).statusCode,
    400,
  );
  assert.equal((await call('calendar.addSeries', { ...input, days: [input.days[0], input.days[0]] })).statusCode, 400);
  const added = await call('calendar.addSeries', input);
  assert.equal(added.statusCode, 200);
  const id = z.object({ result: z.object({ data: z.object({ id: z.string() }) }) }).parse(added.json()).result.data.id;
  const fields = {
    title: 'Altro',
    day: '2026-11-16',
    kind: 'shift',
    person: 'Persona B',
    start: '10:00',
    end: '14:00',
  };
  assert.equal((await call('calendar.editOccurrence', { seriesId: id, day: fields.day, fields })).statusCode, 200);
  let events = (await range('2026-11-16', '2026-11-17')).events;
  assert.deepEqual(
    events.map((event) => [event.day, event.person, event.seriesId, event.seriesDay]),
    [
      ['2026-11-16', 'Persona B', id, '2026-11-16'],
      ['2026-11-17', 'Persona A', id, '2026-11-17'],
    ],
  );
  assert.equal((await call('calendar.restoreOccurrence', { seriesId: id, day: fields.day })).statusCode, 200);
  events = (await range('2026-11-16', '2026-11-17')).events;
  assert.deepEqual(
    events.map((event) => [event.id, event.person]),
    [
      [`series:${id}:2026-11-16`, 'Persona A'],
      [`series:${id}:2026-11-17`, 'Persona A'],
    ],
  );
  assert.equal((await call('calendar.editOccurrence', { seriesId: id, day: '2026-11-16', fields })).statusCode, 200);
  assert.equal(
    (await call('calendar.editOccurrence', { seriesId: id, day: '2026-11-17', fields: null })).statusCode,
    200,
  );
  assert.equal((await range('2026-11-16', '2026-11-24')).events.length, 3);
  assert.equal((await call('calendar.removeSeries', { id })).statusCode, 200);
  events = (await range('2026-11-16', '2026-11-24')).events;
  assert.deepEqual(
    events.map((event) => [event.day, event.person, event.seriesId]),
    [['2026-11-16', 'Persona B', null]],
  );
  assert.equal((await call('calendar.restoreSeries', { id })).statusCode, 200);
  assert.equal((await range('2026-11-16', '2026-11-24')).events.length, 3);
  assert.equal((await call('calendar.updateSeries', { id, title: 'Nuovo' })).statusCode, 200);
  assert.equal((await range('2026-11-23', '2026-11-23')).events[0]?.title, 'Nuovo');
});

void test('range bounds reject huge spans quickly while allowing a full year', async (t) => {
  const { app, call, range } = open();
  t.after(() => app.close());
  await call('calendar.add', { title: 'Capodanno', day: '2026-01-01' });
  const ok = await range('2026-01-01', '2026-12-31');
  assert.equal(ok.status, 200);
  assert.equal(ok.events.length, 1);

  const started = performance.now();
  const huge = await range('0100-01-01', '9999-12-31');
  assert.ok(performance.now() - started < 20);
  assert.equal(huge.status, 400);
});
