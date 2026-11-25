import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function demoEnvironment(root: string, serverPort: number, webPort: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HUB_PORT: String(serverPort),
    HUB_E2E_WEB_PORT: String(webPort),
    HUB_E2E_TMP: root,
    HUB_E2E_DIST: join(root, 'empty'),
    HUB_MODULES_ROOT: join(root, 'empty'),
    HUB_INSTALLED_MODULES_ROOT: join(root, 'empty'),
    HUB_EXAMPLE_MODULES: '0',
    HUB_VITE_CACHE: join(root, 'vite'),
  };
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a demo port');
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

async function runDemo() {
  const root = await mkdtemp(join(tmpdir(), 'hub-demo-'));
  try {
    await mkdir(join(root, 'empty'));
    const serverPort = await freePort();
    let webPort = await freePort();
    while (webPort === serverPort) webPort = await freePort();
    const env = demoEnvironment(root, serverPort, webPort);
    const cwd = fileURLToPath(new URL('../', import.meta.url));
    const children = [
      spawn(process.execPath, ['apps/server/src/testing/fake.ts'], { cwd, env, stdio: 'inherit' }),
      spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'],
        {
          cwd: join(cwd, 'apps/web'),
          env,
          stdio: 'inherit',
        },
      ),
    ];
    const completions = children.map((child) => once(child, 'close'));
    const stop = () => {
      for (const child of children) child.kill('SIGTERM');
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.stdout.write(
      `Demo: http://localhost:${webPort}/desk\nDeck: http://localhost:${webPort}/deck\nTemporary data: ${root}\nCtrl+C to stop.\n`,
    );
    try {
      const [code] = await Promise.race(completions);
      process.exitCode = typeof code === 'number' ? code : 0;
    } finally {
      stop();
      await Promise.all(completions);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (import.meta.main) await runDemo();
