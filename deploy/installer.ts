import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  constants,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export type DesktopFiles = {
  music: string | null;
  service: string | null;
  hyprland: string | null;
  cli: string | null;
};
type Templates = { music: string; service: string; hyprland: string; toggle: string };
type InstallState = {
  version: 1;
  original: DesktopFiles;
  installed: DesktopFiles;
  pending?: DesktopFiles;
  legacyMusic?: boolean;
};
type Plan = { next: DesktopFiles; state: InstallState | null };
type Command = (binary: string, args: string[], repo: string) => void;
const keys: (keyof DesktopFiles)[] = ['service', 'music', 'hyprland', 'cli'];
const start = '-- >>> hub';
const end = '-- <<< hub';

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/@([A-Z_]+)@/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Missing template value: ${name}`);
    return value;
  });
}

export function systemdPath(path: string): string {
  if (!path.startsWith('/') || Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new Error('Expected an absolute path without control characters');
  return path.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%');
}

export function resolveNode(executable: string): string {
  const path = realpathSync(executable);
  if (path.startsWith('/run/') || path.includes('/fnm_multishells/')) {
    throw new Error('Node still points to a temporary session path; select a stable fnm installation first');
  }
  return path;
}

export function setMarkerBlock(text: string, body: string | null): string {
  const lines = text.split('\n');
  const starts = lines.flatMap((line, index) => (line === start ? [index] : []));
  const ends = lines.flatMap((line, index) => (line === end ? [index] : []));
  if (starts.length === 0 && ends.length === 0) {
    return body === null ? text : `${text}\n${start}\n${body.trimEnd()}\n${end}\n`;
  }
  const first = starts[0];
  const last = ends[0];
  if (starts.length !== 1 || ends.length !== 1 || first === undefined || last === undefined || first >= last) {
    throw new Error('Ambiguous Hub marker block');
  }
  const offset = lines.slice(0, first).join('\n').length;
  const blockEnd = lines.slice(0, last + 1).join('\n').length + (last < lines.length - 1 ? 1 : 0);
  const before = text.slice(0, offset);
  const after = text.slice(blockEnd);
  return body === null ? before + after : `${before}\n${start}\n${body.trimEnd()}\n${end}\n${after}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCli(text: string | null): Record<string, unknown> {
  const value: unknown = text === null ? {} : JSON.parse(text);
  if (!isObject(value) || ('toggles' in value && !isObject(value.toggles)))
    throw new Error('Invalid Caelestia config or toggles object');
  return value;
}

function toggles(config: Record<string, unknown>): Record<string, unknown> {
  return isObject(config.toggles) ? config.toggles : {};
}

export function mergeToggle(text: string | null, toggle: unknown): string {
  if (!isObject(toggle)) throw new Error('Invalid Hub toggle');
  const config = parseCli(text);
  return JSON.stringify({ ...config, toggles: { ...toggles(config), hub: toggle } }, null, 2) + '\n';
}

function checkOwnership(current: DesktopFiles, previous: InstallState | null): void {
  if (!previous) {
    if (current.service !== null) throw new Error('An existing hub.service is not owned by this installer');
    if ('hub' in toggles(parseCli(current.cli)))
      throw new Error('An existing toggles.hub is not owned by this installer');
    if ((current.hyprland ?? '').split('\n').includes(start))
      throw new Error('Hub marker exists without its ownership manifest');
    return;
  }
  if (
    current.service !== previous.installed.service &&
    current.service !== previous.pending?.service &&
    current.service !== null
  )
    throw new Error('Owned service was changed; refusing to overwrite it');
  const currentHub = toggles(parseCli(current.cli)).hub;
  const installedHub = toggles(parseCli(previous.installed.cli)).hub;
  const pendingHub = previous.pending ? toggles(parseCli(previous.pending.cli)).hub : undefined;
  if (
    currentHub !== undefined &&
    JSON.stringify(currentHub) !== JSON.stringify(installedHub) &&
    JSON.stringify(currentHub) !== JSON.stringify(pendingHub)
  )
    throw new Error('Owned hub toggle was changed; refusing to overwrite it');
}

export function prepareInstall(
  current: DesktopFiles,
  templates: Templates,
  previous: InstallState | null,
): Plan & { state: InstallState } {
  checkOwnership(current, previous);
  if (
    previous &&
    previous.original.music === null &&
    previous.installed.music === null &&
    current.music === templates.music
  ) {
    previous = {
      ...previous,
      original: { ...previous.original, music: current.music },
      installed: { ...previous.installed, music: current.music },
    };
  }
  if (
    current.music !== null &&
    current.music !== templates.music &&
    current.music !== previous?.installed.music &&
    current.music !== previous?.pending?.music
  )
    throw new Error('An existing hub-music.service is not owned by this installer');
  const toggle: unknown = JSON.parse(templates.toggle);
  const next = {
    service: templates.service,
    music: templates.music,
    hyprland: setMarkerBlock(current.hyprland ?? '', templates.hyprland),
    cli: mergeToggle(current.cli, toggle),
  };
  const original = previous ? prepareUninstall(current, previous).next : current;
  return { next, state: { version: 1, original, installed: next } };
}

export function prepareUninstall(current: DesktopFiles, previous: InstallState | null): Plan {
  if (!previous) return { next: current, state: null };
  checkOwnership(current, previous);
  if (previous.legacyMusic) {
    previous = {
      ...previous,
      original: { ...previous.original, music: current.music },
      installed: { ...previous.installed, music: current.music },
    };
  }
  const original = previous.original;
  let cli = current.cli === null ? null : original.cli;
  if (
    current.cli !== previous.installed.cli &&
    current.cli !== previous.pending?.cli &&
    current.cli !== original.cli &&
    current.cli !== null
  ) {
    const config = parseCli(current.cli);
    const remaining = { ...toggles(config) };
    delete remaining.hub;
    config.toggles = remaining;
    if (Object.keys(remaining).length === 0 && !('toggles' in parseCli(original.cli))) delete config.toggles;
    cli = JSON.stringify(config, null, 2) + '\n';
  }
  const hyprland =
    current.hyprland === previous.installed.hyprland || current.hyprland === previous.pending?.hyprland
      ? original.hyprland
      : current.hyprland === null
        ? null
        : setMarkerBlock(current.hyprland, null);
  if (
    current.music !== null &&
    current.music !== previous.installed.music &&
    current.music !== previous.pending?.music &&
    current.music !== original.music
  )
    throw new Error('Owned music service was changed; refusing to overwrite it');
  return { next: { music: original.music, service: original.service, hyprland, cli }, state: null };
}

function isSnapshot(value: unknown): value is DesktopFiles {
  return isObject(value) && keys.every((key) => value[key] === null || typeof value[key] === 'string');
}

function parseState(text: string | null): InstallState | null {
  if (text === null) return null;
  const value: unknown = JSON.parse(text);
  const legacyMusic = isObject(value) && isObject(value.original) && !('music' in value.original);
  if (isObject(value)) {
    for (const key of ['original', 'installed', 'pending']) {
      const snapshot = value[key];
      if (isObject(snapshot) && !('music' in snapshot)) snapshot.music = null;
    }
  }
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !isSnapshot(value.original) ||
    !isSnapshot(value.installed) ||
    (value.pending !== undefined && !isSnapshot(value.pending))
  ) {
    throw new Error('Invalid Hub desktop ownership manifest');
  }
  return {
    version: 1,
    original: value.original,
    installed: value.installed,
    ...(isSnapshot(value.pending) ? { pending: value.pending } : {}),
    ...(legacyMusic ? { legacyMusic: true } : {}),
  };
}

function readText(path: string): string | null {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error(`Refusing a symlink or non-file: ${path}`);
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

function writeChange(path: string, before: string | null, after: string | null): void {
  if (before === after) return;
  if (readText(path) !== before) throw new Error(`File changed during install: ${path}`);
  if (before !== null) {
    const stamp = new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID();
    copyFileSync(path, `${path}.hub-backup-${stamp}`, constants.COPYFILE_EXCL);
  }
  if (after === null) {
    unlinkSync(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.hub-tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, after, { mode: before === null ? 0o600 : lstatSync(path).mode & 0o777, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function diff(path: string, before: string | null, after: string | null): string {
  const oldLines = before === null ? [] : before.split('\n').slice(0, before.endsWith('\n') ? -1 : undefined);
  const newLines = after === null ? [] : after.split('\n').slice(0, after.endsWith('\n') ? -1 : undefined);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines.at(-1 - suffix) === newLines.at(-1 - suffix)
  )
    suffix++;
  const from = Math.max(0, prefix - 3);
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + 3);
  const newEnd = Math.min(newLines.length, newLines.length - suffix + 3);
  return [
    `--- ${before === null ? '/dev/null' : path}`,
    `+++ ${after === null ? '/dev/null' : path}`,
    `@@ -${from + 1},${oldEnd - from} +${from + 1},${newEnd - from} @@`,
    ...oldLines.slice(from, prefix).map((line) => ' ' + line),
    ...oldLines.slice(prefix, oldLines.length - suffix).map((line) => '-' + line),
    ...newLines.slice(prefix, newLines.length - suffix).map((line) => '+' + line),
    ...newLines.slice(newLines.length - suffix, newEnd).map((line) => ' ' + line),
  ].join('\n');
}

function runCommand(binary: string, args: string[], repo: string): void {
  execFileSync(binary, args, { cwd: repo, stdio: 'inherit' });
}

export function runInstaller({
  repo,
  node,
  configDir,
  stateDir,
  templates,
  apply,
  uninstall,
  run = runCommand,
}: {
  repo: string;
  node: string;
  configDir: string;
  stateDir: string;
  templates: Templates;
  apply: boolean;
  uninstall: boolean;
  run?: Command;
}): string {
  const paths = {
    service: join(configDir, 'systemd/user/hub.service'),
    music: join(configDir, 'systemd/user/hub-music.service'),
    hyprland: join(configDir, 'caelestia/hypr-user.lua'),
    cli: join(configDir, 'caelestia/cli.json'),
  };
  const manifest = join(stateDir, 'desktop-install.json');
  const manifestBefore = readText(manifest);
  const previous = parseState(manifestBefore);
  const current = {
    music: readText(paths.music),
    service: readText(paths.service),
    hyprland: readText(paths.hyprland),
    cli: readText(paths.cli),
  };
  const filled = {
    ...templates,
    service: fillTemplate(templates.service, { REPO: systemdPath(repo), NODE: systemdPath(node) }),
  };
  const plan = uninstall ? prepareUninstall(current, previous) : prepareInstall(current, filled, previous);
  const changed = keys.filter((key) => current[key] !== plan.next[key]);
  const manifestAfter = plan.state === null ? null : JSON.stringify(plan.state, null, 2) + '\n';
  const output = [
    apply ? 'Apply' : 'Dry run: no files or services changed',
    uninstall ? 'Uninstall desktop integration' : 'Install desktop integration',
    `Node: ${node}`,
    ...changed.map((key) => diff(paths[key], current[key], plan.next[key])),
    ...(manifestBefore !== manifestAfter
      ? [`${manifestAfter === null ? 'Remove' : 'Write'} ownership manifest: ${manifest}`]
      : []),
    `${changed.length} desktop file(s) to change. Existing files are backed up before modification.`,
    ...(!uninstall
      ? ['Build: pnpm --filter @hub/web build', 'Service: systemctl --user daemon-reload; enable --now hub.service']
      : previous
        ? ['Service: systemctl --user disable --now hub.service; daemon-reload']
        : []),
  ];
  if (!apply) return output.join('\n');
  if (!uninstall) run('pnpm', ['--filter', '@hub/web', 'build'], repo);
  for (const key of keys) {
    if (readText(paths[key]) !== current[key]) throw new Error(`File changed during install: ${paths[key]}`);
  }
  if (readText(manifest) !== manifestBefore) throw new Error('Ownership manifest changed during install');
  if (uninstall && previous) run('systemctl', ['--user', 'disable', '--now', 'hub.service'], repo);
  // During a partial upgrade, both the old and new owned values must remain recoverable.
  const stagedManifest =
    !uninstall && changed.length > 0 && plan.state !== null
      ? JSON.stringify({ ...plan.state, pending: current }, null, 2) + '\n'
      : manifestBefore;
  if (!uninstall) writeChange(manifest, manifestBefore, stagedManifest);
  for (const key of changed) writeChange(paths[key], current[key], plan.next[key]);
  writeChange(manifest, uninstall ? manifestBefore : stagedManifest, manifestAfter);
  if (!uninstall || previous) run('systemctl', ['--user', 'daemon-reload'], repo);
  if (!uninstall) run('systemctl', ['--user', 'enable', '--now', 'hub.service'], repo);
  return output.join('\n');
}
