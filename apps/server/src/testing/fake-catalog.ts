import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Run, StreamSpawn } from '../core/exec.ts';

/** Git and web builds stay inside the e2e run, without subprocesses or network access. */
export function createFakeCatalog() {
  const control = { version: '1.0.0', failBuild: false, failSync: false, manualRestart: false, hideDemo: false };
  async function writeRepository(root: string) {
    const modules = [
      {
        name: 'catalog-demo',
        title: 'Modulo esempio',
        description: 'Un modulo dal catalogo di prova.',
        version: control.version,
        path: 'demo',
      },
      {
        name: 'catalog-local',
        title: 'Modulo locale',
        description: 'Un modulo già presente sul PC.',
        version: '1.0.0',
        path: 'local',
      },
    ];
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'hub-catalog.json'),
      JSON.stringify({
        version: 1,
        name: 'Catalogo esempio',
        description: 'Moduli condivisi per Hub.',
        modules: modules.filter((module) => !control.hideDemo || module.name !== 'catalog-demo'),
      }),
    );
    for (const module of modules) {
      await mkdir(join(root, module.path), { recursive: true });
      await writeFile(join(root, module.path, 'server.ts'), 'export default {};\n');
    }
  }
  const run: Run = async (_bin, args) => {
    if (control.failSync) return { stdout: '', stderr: 'Fake Git unavailable', code: 1 };
    if (args.includes('clone')) await writeRepository(args.at(-1) ?? '');
    if (args.includes('reset')) await writeRepository(args[args.indexOf('-C') + 1] ?? '');
    return {
      stdout: args.includes('rev-parse') ? `${control.version === '1.0.0' ? 'a'.repeat(40) : 'b'.repeat(40)}\n` : '',
      stderr: '',
      code: 0,
    };
  };
  const spawn: StreamSpawn = (_bin, _args, line, end) => {
    const fail = control.failBuild;
    const timer = setTimeout(() => {
      line(fail ? 'Fake build failed' : 'Fake build completed', fail ? 'stderr' : 'stdout');
      end(fail ? 1 : 0);
    }, 800);
    return {
      kill() {
        clearTimeout(timer);
        end(null);
      },
    };
  };
  return { control, run, spawn };
}
