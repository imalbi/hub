import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// One e2e run owns two free ports and a temp folder, so two runs (two sessions, or a session and a hook) never meet.
// Playwright's main process loads this module first and exports the choice through `process.env`; workers are forked
// from it and read the same values instead of choosing again.
const SERVER = 'HUB_E2E_SERVER_PORT';
const WEB = 'HUB_E2E_WEB_PORT';
const TMP = 'HUB_E2E_TMP';

/** Binds two ports on port 0 at once (so they differ), reads them and closes them. */
function freePorts() {
  const script =
    "const net=require('node:net');const a=net.createServer(),b=net.createServer();" +
    "a.listen(0,'127.0.0.1',()=>b.listen(0,'127.0.0.1',()=>{console.log(a.address().port,b.address().port);a.close();b.close();}));";
  const out = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  const [server, web] = out.stdout.trim().split(' ').map(Number);
  if (!server || !web) throw new Error(`e2e: could not find two free ports: ${out.stderr}`);
  return { server, web };
}

if (!process.env[TMP]) {
  const ports = freePorts();
  const dir = mkdtempSync(join(tmpdir(), 'hub-e2e-'));
  process.env[SERVER] = String(ports.server);
  process.env[WEB] = String(ports.web);
  process.env[TMP] = dir;
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
}

export const SERVER_PORT = Number(process.env[SERVER]);
export const WEB_PORT = Number(process.env[WEB]);
export const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
/** Fixtures the fake server writes and specs rewrite (Caelestia scheme, powerstat), one folder per run. */
export const RUN_TMP = process.env[TMP] ?? tmpdir();

// Same machine, two names: the fake server treats `localhost` as the PC and `127.0.0.1` as a phone (see `fake.ts`).
export const PC_URL = `http://localhost:${WEB_PORT}`;
export const PHONE_URL = `http://127.0.0.1:${WEB_PORT}`;

/** The browser state of the deck paired by `pair.setup.ts`: its token in localStorage. It belongs to this run's server. */
export const DECK_STATE = join(RUN_TMP, 'deck.json');
