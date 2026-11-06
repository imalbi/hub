import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BriefcaseIcon } from '@phosphor-icons/react';
import type { ModuleUI, PageTab } from '../lib/module-ui.ts';
import { moduleZones, orphanSections, pageTabs } from './zone-sections.ts';

const page = () => null;
const tab = (id: string): PageTab => ({ id, label: () => id, component: page });
const section = (zone: string, id: string) => ({ ...tab(id), zone });
const zone = (id: string) => ({ id, label: () => id, icon: BriefcaseIcon, page });
const ui = (name: string, extra: Partial<ModuleUI> = {}): ModuleUI => ({ name, copy: {}, ...extra });
const ids = (tabs: readonly PageTab[]) => tabs.map((entry) => entry.id);

void test('a page lists its own tabs, then the sections aimed at it in module order', () => {
  const uis = [
    ui('a', { sections: [section('devices', 'a-one'), section('work', 'a-work'), section('devices', 'a-two')] }),
    ui('b', { sections: [section('devices', 'b-one')] }),
  ];
  assert.deepEqual(ids(pageTabs('devices', [tab('devices')], uis)), ['devices', 'a-one', 'a-two', 'b-one']);
});

void test('a page with one tab of its own gets a second from a section, and a page with only sections lists them', () => {
  const uis = [ui('hue', { sections: [section('devices', 'lights')] })];
  assert.equal(pageTabs('devices', [tab('devices')], uis).length, 2);
  assert.equal(pageTabs('devices', [tab('devices')], []).length, 1);
  assert.deepEqual(ids(pageTabs('work', [], [ui('hello', { sections: [section('work', 'hello')] })])), ['hello']);
  assert.deepEqual(pageTabs('work', [], []), []);
});

void test('a section can aim at a zone another module declares', () => {
  // The zone ids come from `zones.ts` (built-in and module zones alike); the module that owns `hello` is not involved.
  const uis = [ui('other', { sections: [section('hello', 'extra')] })];
  assert.deepEqual(ids(pageTabs('hello', [tab('hello')], uis)), ['hello', 'extra']);
  assert.deepEqual(orphanSections(uis, new Set(['hello'])), []);
});

void test('a section aimed at a zone that does not exist is on no page and is reported', () => {
  const lost = section('nowhere', 'lost');
  const uis = [ui('a', { sections: [lost, section('devices', 'kept')] })];
  const known = new Set(['devices', 'work']);
  assert.deepEqual(orphanSections(uis, known), [lost]);
  for (const target of known) assert.ok(!ids(pageTabs(target, [], uis)).includes('lost'));
});

void test('a module zone whose id is the path of a built-in page is skipped, the others are kept', () => {
  const uis = [ui('a', { zone: zone('lavoro') }), ui('b', { zone: zone('ricerca') }), ui('c')];
  assert.deepEqual(
    moduleZones(uis, new Set(['studio', 'lavoro', 'messaggi'])).map((entry) => entry.id),
    ['ricerca'],
  );
});
