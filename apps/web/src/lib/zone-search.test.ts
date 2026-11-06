import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeTab, tabParam, zoneSearch } from './zone-search.ts';

const ids = ['devices', 'lights', 'extra'];

void test('the search schema keeps a string tab, drops anything else without failing and ignores other keys', () => {
  assert.equal(zoneSearch.parse({}).tab, undefined);
  assert.equal(zoneSearch.parse({ tab: 'lights' }).tab, 'lights');
  // The router parses `?tab=3` as a number; an issue would fail the route, so a bad value is dropped instead.
  assert.equal(zoneSearch.parse({ tab: 3 }).tab, undefined);
  assert.equal(zoneSearch.parse({ tab: ['lights'] }).tab, undefined);
  assert.equal(zoneSearch.parse({ tab: null }).tab, undefined);
  assert.deepEqual(zoneSearch.parse({ tab: 'lights', other: 'kept out' }), { tab: 'lights' });
});

void test('the active tab is the one in the URL when the page has it, the first otherwise', () => {
  assert.equal(activeTab(ids, undefined), 'devices');
  assert.equal(activeTab(ids, 'devices'), 'devices');
  assert.equal(activeTab(ids, 'lights'), 'lights');
  assert.equal(activeTab(ids, 'nope'), 'devices');
  assert.equal(activeTab(ids, ''), 'devices');
  assert.equal(activeTab([], 'lights'), undefined);
});

void test('the first tab is the default and stays out of the URL', () => {
  assert.equal(tabParam(ids, 'devices'), undefined);
  assert.equal(tabParam(ids, 'lights'), 'lights');
});
