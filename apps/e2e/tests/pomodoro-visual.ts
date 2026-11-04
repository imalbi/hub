import type { Page } from '@playwright/test';

export const idlePomodoro = {
  phase: 'idle',
  startedAt: null,
  endsAt: null,
  pausedRemainingMs: null,
  durationMs: 0,
  completedFocusToday: 0,
};
export const pausedPomodoro = {
  phase: 'focus',
  startedAt: 1_793_792_400_000,
  endsAt: null,
  pausedRemainingMs: 750_000,
  durationMs: 1_500_000,
  completedFocusToday: 2,
};
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Keep screenshots independent of history and wall time; other subscriptions still reach the real fake server.
export async function freezePomodoro(page: Page, state: unknown = idlePomodoro) {
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      let value: unknown;
      try {
        value = JSON.parse(message.toString());
      } catch {
        socket.send(message);
        return;
      }
      if (
        isObject(value) &&
        isObject(value.result) &&
        value.result.type === 'data' &&
        isObject(value.result.data) &&
        'completedFocusToday' in value.result.data
      ) {
        socket.send(JSON.stringify({ ...value, result: { ...value.result, data: state } }));
      } else socket.send(message);
    });
  });
}
