export class LlmGateError extends Error {
  readonly reason: 'cap' | 'timeout';
  constructor(reason: 'cap' | 'timeout') {
    super(reason);
    this.reason = reason;
  }
}

export function createLlmGate() {
  let active = false;
  let lastStart = Number.NEGATIVE_INFINITY;
  let day = '';
  let count = 0;
  const queue: (() => void)[] = [];

  function used() {
    const today = new Date().toDateString();
    // shortcut: the count resets on restart, persist it when a second LLM caller arrives (voice, phase 3)
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

  function run<T>(cap: number, call: (signal: AbortSignal) => Promise<T>, { minIntervalMs = 0 } = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      function start() {
        active = true;
        const delay = lastStart + minIntervalMs - Date.now();
        if (delay > 0) {
          setTimeout(start, delay);
          return;
        }
        if (used() >= cap) {
          reject(new LlmGateError('cap'));
          next();
          return;
        }
        count++;
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
      if (active) queue.push(start);
      else start();
    });
  }

  return Object.assign(run, { used });
}

export const llmGate = createLlmGate();
