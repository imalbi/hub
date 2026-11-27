import { localDay } from '../modules/notes/notes.ts';

export type LlmUsageStore = {
  read(day: string): number;
  increment(day: string): number;
};

export class LlmGateError extends Error {
  readonly reason: 'cap' | 'timeout';
  constructor(reason: 'cap' | 'timeout') {
    super(reason);
    this.reason = reason;
  }
}

export function createLlmGate(store?: LlmUsageStore) {
  let active = false;
  let lastStart = Number.NEGATIVE_INFINITY;
  let day = '';
  let count = 0;
  const queue: (() => void)[] = [];

  function used() {
    const today = localDay(new Date());
    if (store) return store.read(today);
    if (day !== today) {
      day = today;
      count = 0;
    }
    return count;
  }

  function next() {
    active = false;
    queue.shift()?.();
  }

  function run<T>(
    cap: number,
    call: (signal: AbortSignal) => Promise<T>,
    { minIntervalMs = 0, counted = true, front = false } = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      function start() {
        active = true;
        const delay = lastStart + minIntervalMs - Date.now();
        if (delay > 0) {
          setTimeout(start, delay);
          return;
        }
        try {
          if (counted && used() >= cap) throw new LlmGateError('cap');
          if (counted) {
            if (store) store.increment(localDay(new Date()));
            else count++;
          }
        } catch (error) {
          reject(error);
          next();
          return;
        }
        lastStart = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
          reject(new LlmGateError('timeout'));
        }, 30_000);
        let work: Promise<T>;
        try {
          work = call(controller.signal);
        } catch (error) {
          clearTimeout(timer);
          reject(error);
          next();
          return;
        }
        void work.then(resolve, reject).finally(() => {
          clearTimeout(timer);
          next();
        });
      }
      if (active && front) queue.unshift(start);
      else if (active) queue.push(start);
      else start();
    });
  }

  return Object.assign(run, {
    used,
    setStore(this: void, nextStore: LlmUsageStore) {
      store = nextStore;
    },
  });
}

export const llmGate = createLlmGate();
