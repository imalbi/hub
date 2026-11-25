import type { Page } from '@playwright/test';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A stale bundle receiving an incompatible module payload must only lose that module's view. */
export async function breakHello(page: Page) {
  let broken = true;
  await page.routeWebSocket(/\/trpc/, (socket) => {
    const server = socket.connectToServer();
    const ids = new Set<unknown>();
    socket.onMessage((message) => {
      if (message !== 'PING' && message !== 'PONG') {
        const value: unknown = JSON.parse(message.toString());
        for (const request of Array.isArray(value) ? value : [value])
          if (isObject(request) && isObject(request.params) && request.params.path === 'hello.onState')
            ids.add(request.id);
      }
      server.send(message);
    });
    server.onMessage((message) => {
      if (message !== 'PING' && message !== 'PONG') {
        const value: unknown = JSON.parse(message.toString());
        if (broken && isObject(value) && ids.has(value.id) && isObject(value.result) && value.result.type === 'data') {
          socket.send(
            JSON.stringify({
              ...value,
              result: { ...value.result, data: { greeting: { invalid: true }, count: { toString: 0, valueOf: 0 } } },
            }),
          );
          return;
        }
      }
      socket.send(message);
    });
  });
  return () => {
    broken = false;
  };
}
