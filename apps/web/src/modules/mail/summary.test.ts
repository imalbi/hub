import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { summarizeMail } from './summary.ts';

void test('unread totals preserve the window limit and do not hide a failed account', () => {
  assert.deepEqual(
    summarizeMail([
      { unread: 2, capped: true },
      { unread: 1, capped: false },
    ]),
    {
      count: 3,
      capped: true,
    },
  );
  assert.deepEqual(
    summarizeMail([
      { unread: 2, capped: false },
      { unread: null, capped: false },
    ]),
    {
      count: null,
      capped: false,
    },
  );
});
