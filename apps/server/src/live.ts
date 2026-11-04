import { EventEmitter, on } from 'node:events';

/**
 * One poller shared by every subscriber of a piece of state. It polls `read` only while someone is subscribed and
 * emits only when the JSON of the state changed. `read` must not throw on expected conditions (`run` never does).
 */
export function createLiveHub<T>(read: () => Promise<T>, intervalMs = 1000) {
  const events = new EventEmitter();
  let subscribers = 0;
  let timer: NodeJS.Timeout | undefined;
  let latest: { value: T; json: string } | undefined;
  let reading: Promise<void> | undefined;
  let readAgain = false;

  async function readOnce() {
    try {
      const value = await read();
      const json = JSON.stringify(value);
      if (json === latest?.json) return;
      latest = { value, json };
      events.emit('change', value);
    } catch (error) {
      // Every live subscriber also listens for 'error' (see `on`), so this ends their subscriptions instead of crashing the poller.
      if (events.listenerCount('error') > 0) events.emit('error', error);
    }
  }

  // Reads never overlap: a refresh that arrives mid-read (a tick, or a mutation) runs once more afterwards, so a
  // state read before the mutation finished is never the last word.
  async function drain() {
    do {
      readAgain = false;
      await readOnce();
    } while (readAgain);
    reading = undefined;
  }

  function refresh() {
    if (reading) readAgain = true;
    else reading = drain();
    return reading;
  }

  async function* subscribe(signal?: AbortSignal): AsyncGenerator<T, void> {
    // Listening starts synchronously, so no change can slip in between reading `latest` and waiting for the next one.
    const changes = on(events, 'change', { signal });
    subscribers++;
    timer ??= setInterval(() => void refresh(), intervalMs);
    try {
      if (latest) yield latest.value;
      else if (!reading) void refresh(); // a read already in flight will reach this subscriber through `changes`
      for await (const [value] of changes) yield value;
    } finally {
      if (--subscribers === 0) {
        clearInterval(timer);
        timer = undefined;
        // Nobody keeps it fresh any more; the next subscriber must read instead of replaying a stale value.
        latest = undefined;
      }
    }
  }

  /** Call after a mutation: pushes the new state now instead of at the next tick. Nobody subscribed, nothing to push. */
  async function notify() {
    if (subscribers > 0) await refresh();
  }

  return { subscribe, notify };
}

export type LiveHub<T> = ReturnType<typeof createLiveHub<T>>;
