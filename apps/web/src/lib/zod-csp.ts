import { z as rawZod } from 'zod';

// Zod v4 probes `new Function("")` when constructing object schemas unless `jitless` is set, triggering a CSP violation under strict `script-src 'self'`.
function configureZod() {
  rawZod.config({ jitless: true });
  return rawZod;
}

export const z = configureZod();
