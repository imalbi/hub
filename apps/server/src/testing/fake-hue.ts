import { HueError, type HueTransport } from '../integrations/hue/bluez.ts';
import type { HueCommand, HueState } from '../integrations/hue/contracts.ts';

/** What a test (or the e2e server) can see and do to the fake light behind the transport. */
export type FakeHueControl = {
  readonly writes: HueCommand[];
  readonly watchers: number;
  readonly closed: boolean;
  state(): HueState;
  /** Change the light as if something else did (Echo, a power cut), and tell the subscribers. */
  patch(change: Partial<HueState>): void;
  /** Back to the starting light with no writes recorded, for a test that must leave nothing behind. */
  reset(): void;
};

let latest: FakeHueControl | undefined;
/** The fake most recently created, which is the one the example module made for the server under test. */
export const getFakeHue = () => latest;

/** A light that follows the same refusals as the BlueZ transport, and never touches Bluetooth. */
export function createFakeHue(initial: Partial<HueState> = {}) {
  const start: HueState = {
    availability: 'ready',
    power: true,
    brightnessPercent: 80,
    model: 'FAKE-1',
    capabilities: { power: true, brightness: true },
    ...initial,
  };
  let state = start;
  const writes: HueCommand[] = [];
  const listeners = new Set<() => void>();
  let watchers = 0;
  let closed = false;

  function patch(change: Partial<HueState>) {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }

  const transport: HueTransport = {
    readState: () => state,
    execute(command) {
      if (state.availability !== 'ready') return Promise.reject(new HueError('unavailable'));
      const supported = command.type === 'setPower' ? state.capabilities.power : state.capabilities.brightness;
      if (!supported) return Promise.reject(new HueError('unsupported'));
      writes.push(command);
      patch(command.type === 'setPower' ? { power: command.on } : { brightnessPercent: command.percent });
      return Promise.resolve();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    watch() {
      watchers++;
      let released = false;
      return () => {
        if (!released) watchers--;
        released = true;
      };
    },
    close() {
      closed = true;
      listeners.clear();
      return Promise.resolve();
    },
  };
  const control: FakeHueControl = {
    writes,
    get watchers() {
      return watchers;
    },
    get closed() {
      return closed;
    },
    state: () => state,
    patch,
    reset() {
      writes.length = 0;
      patch(start);
    },
  };
  latest = control;
  return { transport, control };
}
