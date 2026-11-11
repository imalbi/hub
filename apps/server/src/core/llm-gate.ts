export class LlmGateError extends Error {
  readonly reason: 'busy' | 'cap' | 'timeout';
  constructor(reason: 'busy' | 'cap' | 'timeout') {
    super(reason);
    this.reason = reason;
  }
}

export function createLlmGate() {
  let active = false;
  let day = '';
  let count = 0;

  return async function run<T>(cap: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (active) throw new LlmGateError('busy');
    const today = new Date().toDateString();
    // shortcut: the count resets on restart, persist it when a second LLM caller arrives (voice, phase 3)
    if (day !== today) {
      day = today;
      count = 0;
    }
    if (count >= cap) throw new LlmGateError('cap');
    active = true;
    count++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let work: Promise<T>;
    try {
      work = call(controller.signal).finally(() => {
        active = false;
      });
    } catch (error) {
      clearTimeout(timer);
      active = false;
      throw error;
    }
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new LlmGateError('timeout')), { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

export const llmGate = createLlmGate();
