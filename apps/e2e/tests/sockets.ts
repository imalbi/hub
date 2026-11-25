import type { Page } from '@playwright/test';

declare global {
  interface Window {
    hubSockets: { offline: boolean; silent: boolean; open: WebSocket[] };
  }
}

/**
 * Lets a test cut tRPC WebSockets and refuse new ones like a server that went away. A refused handshake is
 * what sends the tRPC client into its retry loop: `page.routeWebSocket` with an instant `close()` opens the socket
 * first, and the client then never retries. Call before `page.goto`.
 */
export async function controlSockets(page: Page) {
  await page.addInitScript(() => {
    const control: Window['hubSockets'] = { offline: false, silent: false, open: [] };
    window.hubSockets = control;
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        const api = new URL(url, location.href).pathname === '/trpc';
        // Nothing listens on port 1, so the connection is refused before it opens.
        super(control.offline && api ? 'ws://127.0.0.1:1/trpc' : url, protocols);
        // Vite's socket must stay open, otherwise it reloads the page during an API outage.
        if (api) {
          control.open.push(this);
          this.addEventListener('message', (event) => {
            if (control.silent) event.stopImmediatePropagation();
          });
        }
      }
      override send(data: Parameters<WebSocket['send']>[0]) {
        if (new URL(this.url).pathname === '/trpc' && control.silent) return;
        super.send(data);
      }
    };
  });
  return {
    cut: () =>
      page.evaluate(() => {
        window.hubSockets.offline = true;
        for (const ws of window.hubSockets.open) ws.close();
      }),
    silence: () =>
      page.evaluate(() => {
        window.hubSockets.silent = true;
        window.hubSockets.offline = true;
      }),
    restore: () =>
      page.evaluate(() => {
        window.hubSockets.offline = false;
        window.hubSockets.silent = false;
      }),
  };
}
