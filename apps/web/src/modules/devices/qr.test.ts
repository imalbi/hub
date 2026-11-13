import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode } from 'uqr';
import { qrPath } from './qr.ts';

void test('qrPath draws exactly the dark modules of the matrix inside a quiet zone', () => {
  const url = 'http://hub.example.test:4180/deck';
  const { data } = encode(url, { ecc: 'M', border: 0 });
  const { d, size } = qrPath(url);
  assert.equal(size, data.length + 8);
  assert.equal(d.split('M').length - 1, data.flat().filter(Boolean).length);
  // The three finder patterns put a dark module at each corner but the bottom right.
  assert.ok(d.startsWith('M4 4h'));
});
