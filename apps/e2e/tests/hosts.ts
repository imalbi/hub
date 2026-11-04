export const SERVER_PORT = 4190;
export const WEB_PORT = 5190;

// Same machine, two names: the fake server treats `localhost` as the PC and `127.0.0.1` as a phone (see `fake.ts`).
export const PC_URL = `http://localhost:${WEB_PORT}`;
export const PHONE_URL = `http://127.0.0.1:${WEB_PORT}`;

/** The browser state of the deck paired by `pair.setup.ts`: its token in localStorage. Gitignored, it changes every run. */
export const DECK_STATE = new URL('../.auth/deck.json', import.meta.url).pathname;
