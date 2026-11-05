import { z } from 'zod';
import type { Run } from '../../core/exec.ts';
import { initialHueState, percentToRaw, rawToPercent, type HueCommand, type HueState } from './contracts.ts';

export type HueErrorCode = 'unavailable' | 'unsupported' | 'timeout' | 'failed';

/** Only the code leaves this module: no BlueZ text, path or address ever reaches a client. */
export class HueError extends Error {
  readonly code: HueErrorCode;
  constructor(code: HueErrorCode) {
    super(code);
    this.code = code;
  }
}

export type HueTransport = {
  /** The cached state; the first call starts talking to the light. */
  readState(): HueState;
  /** Resolves once the light holds the new value; rejects with a `HueError`. */
  execute(command: HueCommand): Promise<void>;
  subscribe(listener: () => void): () => void;
  /** Keeps refreshing from the light while at least one watcher exists. */
  watch(): () => void;
  close(): Promise<void>;
};

// The Hue GATT service the light advertises, and the three characteristics Hub uses: power (0 or 1), brightness
// (1..254) and the model number (text). Checked against HueBLE's source and read from the real light.
const HUE_SERVICE = '932c32bd-0000-47a2-835a-a8d455b859dd';
const POWER = '932c32bd-0002-47a2-835a-a8d455b859dd';
const BRIGHTNESS = '932c32bd-0003-47a2-835a-a8d455b859dd';
const MODEL = '00002a24-0000-1000-8000-00805f9b34fb';
const CALL_MS = 15_000;

const property = z.object({ data: z.unknown() });
const managedObjects = z.object({
  data: z.tuple([z.record(z.string(), z.record(z.string(), z.record(z.string(), property)))]),
});
const bytes = z.object({ data: z.tuple([z.array(z.number())]) });
type Objects = z.infer<typeof managedObjects>['data'][0];

type Link = { device: string; power: string; brightness: string | undefined; model: string | undefined };

const read = (objects: Objects, path: string, iface: string, name: string) => objects[path]?.[iface]?.[name]?.data;

/**
 * One Hue Bluetooth light through BlueZ, with the `busctl` already on the machine and the injected `run`: no helper
 * process, no second language. It never pairs (a light BlueZ does not list as paired is left alone), connects when
 * it has to, and reads the light back after every write so the state is what the light holds, not what was sent.
 * Echo's changes are found by polling every few seconds while somebody watches: a power-off is not pushed.
 */
export function createHueBluez({
  run,
  address,
  onWarn = () => {},
  refreshMs = 5_000,
  backoffMs = [1_000, 2_000, 5_000, 30_000],
}: {
  run: Run;
  /** Which light, when more than one is paired. Without it, the only paired Hue light. */
  address?: string;
  onWarn?: (message: string) => void;
  refreshMs?: number;
  backoffMs?: readonly number[];
}): HueTransport {
  let state = initialHueState;
  let link: Link | undefined;
  let closed = false;
  let weConnected = false;
  let attempt = 0;
  let timer: NodeJS.Timeout | undefined;
  let stepQueued = false;
  let stepRunning = false;
  // Bumped whenever the connection is lost: a command queued before that must not run on its replacement.
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let watchers = 0;
  const listeners = new Set<() => void>();

  function setState(next: HueState) {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    for (const listener of listeners) listener();
  }

  async function call(path: string, iface: string, method: string, ...signature: string[]) {
    const result = await run(
      'busctl',
      ['--system', '--json=short', 'call', 'org.bluez', path, iface, method, ...signature],
      { timeoutMs: CALL_MS },
    );
    if (result.code === 0) return result.stdout;
    throw new HueError(result.code === -1 ? 'timeout' : 'failed');
  }

  async function listObjects(): Promise<Objects> {
    const stdout = await call('/', 'org.freedesktop.DBus.ObjectManager', 'GetManagedObjects');
    let json: unknown;
    try {
      json = JSON.parse(stdout);
    } catch {
      throw new HueError('failed');
    }
    const parsed = managedObjects.safeParse(json);
    if (!parsed.success) throw new HueError('failed');
    return parsed.data.data[0];
  }

  /** The light to use, and where its characteristics are once BlueZ has resolved its services. */
  function pick(all: Objects): { device: string; connected: boolean; link: Link | undefined } {
    const wanted = address?.toLowerCase();
    const found = Object.keys(all).flatMap((device) => {
      const paired = read(all, device, 'org.bluez.Device1', 'Paired') === true;
      const uuids = read(all, device, 'org.bluez.Device1', 'UUIDs');
      const addressNow = read(all, device, 'org.bluez.Device1', 'Address');
      const isHue = Array.isArray(uuids) && uuids.includes(HUE_SERVICE);
      if (!paired || !isHue) return [];
      if (wanted && !(typeof addressNow === 'string' && addressNow.toLowerCase() === wanted)) return [];
      const characteristic = (uuid: string) =>
        Object.keys(all).find(
          (path) => path.startsWith(`${device}/`) && read(all, path, 'org.bluez.GattCharacteristic1', 'UUID') === uuid,
        );
      const power = characteristic(POWER);
      return [
        {
          device,
          connected: read(all, device, 'org.bluez.Device1', 'Connected') === true,
          link: power
            ? { device, power, brightness: characteristic(BRIGHTNESS), model: characteristic(MODEL) }
            : undefined,
        },
      ];
    });
    // Never a guess: with two candidates and no address, nothing is touched.
    if (found.length !== 1 || !found[0]) throw new HueError('unavailable');
    return found[0];
  }

  async function readBytes(path: string) {
    const parsed = bytes.safeParse(
      JSON.parse(await call(path, 'org.bluez.GattCharacteristic1', 'ReadValue', 'a{sv}', '0')),
    );
    if (!parsed.success) throw new HueError('failed');
    return parsed.data.data[0];
  }

  async function connect(): Promise<Link> {
    let picked = pick(await listObjects());
    if (!picked.connected) {
      await call(picked.device, 'org.bluez.Device1', 'Connect');
      weConnected = true;
      picked = pick(await listObjects());
    }
    if (!picked.link) throw new HueError('unavailable'); // services not resolved yet; retried on the backoff
    return picked.link;
  }

  async function refresh(current: Link, withModel: boolean) {
    const [power] = await readBytes(current.power);
    const brightness = current.brightness ? (await readBytes(current.brightness))[0] : undefined;
    let model = state.model;
    if (withModel && current.model) {
      model = String.fromCharCode(...(await readBytes(current.model)));
    }
    setState({
      availability: 'ready',
      power: power === undefined ? state.power : power === 1,
      brightnessPercent: brightness === undefined ? state.brightnessPercent : rawToPercent(brightness),
      model,
      capabilities: { power: true, brightness: current.brightness !== undefined },
    });
  }

  function lose() {
    link = undefined;
    generation++;
    setState({ ...state, availability: 'unavailable' });
  }

  function schedule(ms: number) {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      queueStep();
    }, ms);
  }

  function scheduleRetry() {
    // Unwatched, the next use retries (`ensureStarted`): a lamp off at the wall costs no background connects.
    if (watchers === 0) return;
    schedule(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 30_000);
    attempt++;
  }

  async function step() {
    if (closed) return;
    stepRunning = true;
    try {
      if (!link) {
        const connected = await connect();
        await refresh(connected, true);
        link = connected;
        attempt = 0;
      } else if (watchers > 0) {
        await refresh(link, false);
      }
      if (watchers > 0) schedule(refreshMs);
    } catch {
      lose();
      scheduleRetry();
    } finally {
      stepRunning = false;
    }
  }

  function queueStep() {
    if (closed || stepQueued || stepRunning) return;
    stepQueued = true;
    clearTimeout(timer);
    timer = undefined;
    queue = queue.then(() => {
      stepQueued = false;
      return step();
    });
  }

  function ensureStarted() {
    if (!link && !timer) queueStep();
  }

  async function write(command: HueCommand, queuedAt: number) {
    const current = link;
    if (generation !== queuedAt || !current) throw new HueError('unavailable');
    try {
      const target = command.type === 'setPower' ? current.power : current.brightness;
      if (!target) throw new HueError('unsupported');
      const byte = command.type === 'setPower' ? (command.on ? 1 : 0) : percentToRaw(command.percent);
      await call(target, 'org.bluez.GattCharacteristic1', 'WriteValue', 'aya{sv}', '1', String(byte), '0');
      await refresh(current, false);
    } catch (error) {
      lose();
      scheduleRetry();
      throw error instanceof HueError ? error : new HueError('failed');
    }
  }

  function refusal(command: HueCommand): HueErrorCode | undefined {
    if (state.availability !== 'ready' || !link) return 'unavailable';
    const supported = command.type === 'setPower' ? state.capabilities.power : state.capabilities.brightness;
    return supported ? undefined : 'unsupported';
  }

  return {
    readState() {
      ensureStarted();
      return state;
    },
    execute(command) {
      ensureStarted();
      const code = refusal(command);
      if (code) return Promise.reject(new HueError(code));
      const queuedAt = generation;
      const written = queue.then(() => write(command, queuedAt));
      queue = written.catch(() => {});
      return written;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    watch() {
      ensureStarted();
      if (++watchers === 1 && link) queueStep();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--watchers === 0 && link) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
    },
    async close() {
      closed = true;
      clearTimeout(timer);
      timer = undefined;
      listeners.clear();
      await queue;
      const current = link;
      lose();
      if (current && weConnected)
        await call(current.device, 'org.bluez.Device1', 'Disconnect').catch(() =>
          onWarn('Hue light disconnect failed'),
        );
    },
  };
}
