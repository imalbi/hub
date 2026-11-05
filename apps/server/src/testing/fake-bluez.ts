import type { Run, RunResult } from '../core/exec.ts';

export const POWER_UUID = '932c32bd-0002-47a2-835a-a8d455b859dd';
export const BRIGHTNESS_UUID = '932c32bd-0003-47a2-835a-a8d455b859dd';
export const MODEL_UUID = '00002a24-0000-1000-8000-00805f9b34fb';
export const HUE_SERVICE_UUID = '932c32bd-0000-47a2-835a-a8d455b859dd';

export type FakeLight = {
  /** BlueZ object path suffix: dev_<address with underscores>. */
  address: string;
  paired: boolean;
  connected: boolean;
  /** What the light really holds, whether or not anyone was told. */
  power: number;
  brightness: number;
  /** A light without brightness has no such characteristic. */
  hasBrightness: boolean;
};

const ok = (stdout = ''): RunResult => ({ stdout, stderr: '', code: 0 });
const fail = (stderr: string, code = 1): RunResult => ({ stdout: '', stderr, code });
const prop = (type: string, data: unknown) => ({ type, data });
const devicePath = (address: string) => `/org/bluez/hci0/dev_${address.replaceAll(':', '_')}`;

/**
 * BlueZ in memory, answering only the exact `busctl` calls the Hue transport makes, with the JSON `--json=short`
 * prints. Everything else is refused with a non-zero code, so nothing here can reach a real binary or the bus.
 */
export function createFakeBluez(lights: FakeLight[], extra: { unrelatedPaired?: string[] } = {}) {
  const calls: Array<{ method: string; path: string; values: string[] }> = [];
  const failing = new Set<string>();
  const hanging = new Set<string>();
  const timeouts: Array<{ method: string; timeoutMs: number | undefined }> = [];
  const model = 'LWA001';

  function managedObjects() {
    const objects: Record<string, Record<string, Record<string, unknown>>> = {};
    for (const address of extra.unrelatedPaired ?? []) {
      objects[devicePath(address)] = {
        'org.bluez.Device1': { Address: prop('s', address), Paired: prop('b', true), Connected: prop('b', false) },
      };
    }
    for (const light of lights) {
      const base = devicePath(light.address);
      objects[base] = {
        'org.bluez.Device1': {
          Address: prop('s', light.address),
          Paired: prop('b', light.paired),
          Connected: prop('b', light.connected),
          ServicesResolved: prop('b', light.connected),
          UUIDs: prop('as', ['0000fe0f-0000-1000-8000-00805f9b34fb', HUE_SERVICE_UUID]),
        },
      };
      // BlueZ exposes the GATT objects once the services are resolved, which needs a connection.
      if (!light.connected) continue;
      const characteristics = [
        ['service0010/char0011', POWER_UUID],
        ...(light.hasBrightness ? [['service0010/char0013', BRIGHTNESS_UUID]] : []),
        ['service0020/char0021', MODEL_UUID],
      ];
      for (const [suffix, uuid] of characteristics) {
        objects[`${base}/${suffix}`] = {
          'org.bluez.GattCharacteristic1': { UUID: prop('s', uuid), Flags: prop('as', ['read', 'write']) },
        };
      }
    }
    return JSON.stringify({ type: 'a{oa{sa{sv}}}', data: [objects] });
  }

  const run: Run = (bin, args, options) => {
    const [system, json, verb, service, path, iface, method, signature, ...values] = args;
    if (
      bin !== 'busctl' ||
      system !== '--system' ||
      json !== '--json=short' ||
      verb !== 'call' ||
      service !== 'org.bluez'
    )
      return Promise.resolve(fail('fake bluez: command not supported', 127));
    const name = method ?? '';
    calls.push({ method: name, path: path ?? '', values });
    timeouts.push({ method: name, timeoutMs: options?.timeoutMs });
    if (hanging.has(name)) return Promise.resolve(fail('', -1));
    if (failing.has(name)) return Promise.resolve(fail(`fake bluez: ${name} failed`));
    if (path === '/' && name === 'GetManagedObjects') return Promise.resolve(ok(managedObjects()));

    const light = lights.find((candidate) => path?.startsWith(devicePath(candidate.address)));
    if (!light || !path) return Promise.resolve(fail('fake bluez: unknown object'));
    if (iface === 'org.bluez.Device1' && name === 'Connect') {
      light.connected = true;
      return Promise.resolve(ok());
    }
    if (iface === 'org.bluez.Device1' && name === 'Disconnect') {
      light.connected = false;
      return Promise.resolve(ok());
    }
    if (iface !== 'org.bluez.GattCharacteristic1') return Promise.resolve(fail('fake bluez: unsupported interface'));
    if (!light.connected) return Promise.resolve(fail('Not connected'));
    const kind = path.endsWith('char0011') ? 'power' : path.endsWith('char0013') ? 'brightness' : 'model';
    if (name === 'ReadValue' && signature === 'a{sv}' && values.join(' ') === '0') {
      const bytes =
        kind === 'power'
          ? [light.power]
          : kind === 'brightness'
            ? [light.brightness]
            : Array.from(model, (character) => character.charCodeAt(0));
      return Promise.resolve(ok(JSON.stringify({ type: 'ay', data: [bytes] })));
    }
    if (
      name === 'WriteValue' &&
      signature === 'aya{sv}' &&
      values.length === 3 &&
      values[0] === '1' &&
      values[2] === '0'
    ) {
      const byte = Number(values[1]);
      if (kind === 'power') light.power = byte;
      else if (kind === 'brightness') light.brightness = byte;
      else return Promise.resolve(fail('fake bluez: model is read only'));
      return Promise.resolve(ok());
    }
    return Promise.resolve(fail('fake bluez: unsupported call'));
  };

  return {
    run,
    calls,
    timeouts,
    /** Make every call of this D-Bus method fail (or time out) until `heal`. */
    breakMethod: (method: string, mode: 'fail' | 'hang' = 'fail') => (mode === 'fail' ? failing : hanging).add(method),
    heal: () => {
      failing.clear();
      hanging.clear();
    },
    count: (method: string) => calls.filter((call) => call.method === method).length,
    writes: () =>
      calls
        .filter((call) => call.method === 'WriteValue')
        .map((call) => ({ path: call.path, byte: Number(call.values[1]) })),
  };
}
