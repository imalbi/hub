import { useSyncExternalStore } from 'react';

/**
 * The current time in ms (in the server's clock when `offset` is given), re-rendered exactly when the second shown
 * changes. Counting down to a target, the ticks fall on the whole seconds of the time left, so the display never lags
 * or skips one; with `'clock'` (or once the target has passed) on whole seconds of the time itself; with `null`, never.
 * Each caller has its own timer, since countdowns align to different boundaries.
 */
export function useNow(target: number | 'clock' | null, offset = 0) {
  const countdown = typeof target === 'number';
  // The snapshot is the second on screen, not Date.now(): it stays equal between ticks, as useSyncExternalStore needs.
  function read() {
    const now = Date.now() + offset;
    return countdown && target > now ? target - Math.ceil((target - now) / 1000) * 1000 : Math.floor(now / 1000) * 1000;
  }
  function subscribe(onChange: () => void) {
    if (target === null) return () => {};
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const now = Date.now() + offset;
      const left = countdown ? target - now : 0;
      const delay = left > 0 ? left - (Math.ceil(left / 1000) - 1) * 1000 : 1000 - (now % 1000);
      timer = setTimeout(() => {
        onChange();
        schedule();
      }, delay);
    }
    schedule();
    return () => clearTimeout(timer);
  }
  return useSyncExternalStore(subscribe, read);
}
