import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createDeviceSockets } from './auth.ts';

function socket() {
  const events = new EventEmitter();
  const closed: Array<{ code?: number; reason?: string }> = [];
  return {
    closed,
    once: (event: 'close', listener: () => void) => events.once(event, listener),
    close(code?: number, reason?: string) {
      closed.push({ code, reason });
      events.emit('close');
    },
  };
}

void test('device sockets expire at the deadline even beyond the maximum Node timer delay', (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const sockets = createDeviceSockets();
  const phone = socket();
  const lifetime = 90 * 86_400_000;
  sockets.track(1, phone, now + lifetime);
  t.mock.timers.tick(2_147_483_647);
  assert.deepEqual(phone.closed, []);
  t.mock.timers.tick(lifetime - 2_147_483_647 - 1);
  assert.deepEqual(phone.closed, []);
  t.mock.timers.tick(1);
  assert.deepEqual(phone.closed, [{ code: 4401, reason: 'Device token expired' }]);
  sockets.closeAll(1);
  assert.equal(phone.closed.length, 1);
});

void test('revocation cancels expiry and a token expiring during authentication closes immediately', (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const sockets = createDeviceSockets();
  const revoked = socket();
  sockets.track(1, revoked, now + 100);
  sockets.closeAll(1);
  t.mock.timers.tick(100);
  assert.deepEqual(revoked.closed, [{ code: 4401, reason: 'Device revoked' }]);
  const expired = socket();
  sockets.track(2, expired, now);
  sockets.closeAll(2);
  assert.deepEqual(expired.closed, [{ code: 4401, reason: 'Device token expired' }]);
});
