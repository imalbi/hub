import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  fillTemplate,
  mergeToggle,
  prepareInstall,
  prepareUninstall,
  resolveNode,
  runInstaller,
  setMarkerBlock,
  systemdPath,
  type DesktopFiles,
} from './installer.ts';

const templates = {
  service: '# >>> hub\n[Service]\nExecStart=/opt/node /opt/hub/server.ts\n# <<< hub\n',
  hyprland: 'hl.bind("SUPER + H", hl.dsp.exec_cmd("caelestia toggle hub"))\n',
  toggle:
    '{"chrome":{"enable":true,"command":["chrome","--app=http://127.0.0.1:4180/desk"],"match":[{"class":"hub-app"}],"move":true}}',
};
const original: DesktopFiles = {
  service: null,
  hyprland: '-- Existing config\nhl.config({})',
  cli: '{ "other": true, "toggles": { "music": { "enabled": true } } }\n',
};

void test('template values stay literal and missing placeholders fail before writing', () => {
  assert.equal(
    fillTemplate('node=@NODE@ repo=@REPO@', { NODE: '/opt/node', REPO: '/opt/$hub' }),
    'node=/opt/node repo=/opt/$hub',
  );
  assert.throws(() => fillTemplate('@MISSING@', {}), /MISSING/);
});

void test('systemd paths escape specifiers and quotes and reject line injection', () => {
  assert.equal(systemdPath('/opt/Hub $name %data "test"'), '/opt/Hub $name %%data \\"test\\"');
  assert.throws(() => systemdPath('/opt/hub\nExecStart=/other'), /path/i);
  assert.throws(() => systemdPath('relative/node'), /path/i);
});

void test('Lua blocks append, update in place, and remove without changing surrounding text', () => {
  for (const text of ['', 'before', 'before\n']) {
    const installed = setMarkerBlock(text, 'first');
    assert.equal(setMarkerBlock(installed, 'first'), installed);
    const withSuffix = installed + '-- Added later\n';
    const updated = setMarkerBlock(withSuffix, 'second');
    assert.ok(updated.includes('-- >>> hub\nsecond\n-- <<< hub\n'));
    assert.equal(setMarkerBlock(updated, null), text + '-- Added later\n');
    assert.equal(setMarkerBlock(installed, null), text);
  }
});

void test('incomplete or duplicate delimiters refuse ambiguous edits', () => {
  for (const text of ['-- >>> hub\nbody', '-- <<< hub\n', '-- >>> hub\n-- >>> hub\n-- <<< hub\n']) {
    assert.throws(() => setMarkerBlock(text, 'body'), /marker/i);
  }
});

void test('toggle merge preserves other entries and rejects invalid config shapes', () => {
  assert.deepEqual(JSON.parse(mergeToggle(original.cli, JSON.parse(templates.toggle))), {
    other: true,
    toggles: { music: { enabled: true }, hub: JSON.parse(templates.toggle) },
  });
  for (const text of ['[]', '{"toggles":[]}', '{"toggles":null}', 'not json']) {
    assert.throws(() => mergeToggle(text, {}));
  }
});

void test('a second install is a no-op and uninstall restores the original bytes', () => {
  const first = prepareInstall(original, templates, null);
  const second = prepareInstall(first.next, templates, first.state);
  assert.deepEqual(second, first);
  assert.deepEqual(prepareUninstall(first.next, first.state).next, original);
});

void test('an interrupted upgrade accepts only its old and new owned content and can install or uninstall again', () => {
  const first = prepareInstall(original, templates, null);
  const updatedTemplates = {
    ...templates,
    service: templates.service.replace('/opt/node', '/opt/new-node'),
    hyprland: templates.hyprland + '-- updated\n',
    toggle: templates.toggle.replace('"chrome"', '"new-chrome"'),
  };
  const upgrade = prepareInstall(first.next, updatedTemplates, first.state);
  const interrupted = { ...upgrade.state, pending: first.next };
  for (const current of [first.next, { ...first.next, service: upgrade.next.service }, upgrade.next]) {
    assert.deepEqual(prepareUninstall(current, interrupted).next, original);
    assert.deepEqual(prepareInstall(current, updatedTemplates, interrupted), upgrade);
  }
  assert.throws(() => prepareUninstall({ ...first.next, service: 'unrelated service' }, interrupted), /changed/i);
});

void test('uninstall retains unrelated edits made after installation', () => {
  const installed = prepareInstall(original, templates, null);
  const current = {
    ...installed.next,
    hyprland: installed.next.hyprland + '\n-- User addition\n',
    cli: installed.next.cli?.replace('"other": true', '"other": false') ?? null,
  };
  const removed = prepareUninstall(current, installed.state).next;
  assert.equal(removed.hyprland, original.hyprland + '\n-- User addition\n');
  assert.deepEqual(JSON.parse(removed.cli ?? ''), { other: false, toggles: { music: { enabled: true } } });
  assert.equal(removed.service, null);
});

void test('reinstall does not claim unrelated additions made since the first install', () => {
  const first = prepareInstall(original, templates, null);
  const current = {
    ...first.next,
    hyprland: first.next.hyprland + '\n-- User addition\n',
    cli: first.next.cli?.replace('"other": true', '"other": false') ?? null,
  };
  const updated = prepareInstall(current, templates, first.state);
  const removed = prepareUninstall(updated.next, updated.state).next;
  assert.equal(removed.hyprland, original.hyprland + '\n-- User addition\n');
  assert.deepEqual(JSON.parse(removed.cli ?? ''), { other: false, toggles: { music: { enabled: true } } });
});

void test('uninstall does not recreate a config file the user deleted', () => {
  const installed = prepareInstall(original, templates, null);
  assert.equal(prepareUninstall({ ...installed.next, cli: null }, installed.state).next.cli, null);
});

void test('foreign service or hub toggle is never overwritten or claimed', () => {
  assert.throws(
    () => prepareInstall({ ...original, service: '[Service]\nExecStart=other\n' }, templates, null),
    /service/i,
  );
  assert.throws(
    () => prepareInstall({ ...original, cli: '{"toggles":{"hub":{"user":true}}}' }, templates, null),
    /hub/i,
  );
});

void test('changed owned service or toggle is preserved by refusing install and uninstall', () => {
  const installed = prepareInstall(original, templates, null);
  for (const current of [
    { ...installed.next, service: installed.next.service + '# user change\n' },
    { ...installed.next, cli: installed.next.cli?.replace('"move": true', '"move": false') ?? null },
  ]) {
    assert.throws(() => prepareInstall(current, templates, installed.state), /changed/i);
    assert.throws(() => prepareUninstall(current, installed.state), /changed/i);
  }
});

void test('uninstall without a manifest makes no changes', () => {
  assert.deepEqual(prepareUninstall(original, null).next, original);
});

void test('node resolution follows a disposable symlink to the stable binary', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-node-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const binary = join(root, 'stable-node');
  const link = join(root, 'session-node');
  writeFileSync(binary, 'binary');
  symlinkSync(binary, link);
  assert.equal(resolveNode(link), binary);
});

void test('dry runs are read-only; apply backs up originals; repeated apply does not rewrite; uninstall restores', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-install-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const configDir = join(root, 'config');
  const stateDir = join(root, 'state');
  const caelestia = join(configDir, 'caelestia');
  mkdirSync(caelestia, { recursive: true });
  const lua = join(caelestia, 'hypr-user.lua');
  const cli = join(caelestia, 'cli.json');
  const legacy = join(caelestia, 'hypr-user.conf');
  writeFileSync(lua, original.hyprland ?? '');
  writeFileSync(cli, original.cli ?? '');
  writeFileSync(legacy, 'legacy must stay untouched');
  const commands: string[][] = [];
  const options = {
    repo: '/opt/hub',
    node: process.execPath,
    configDir,
    stateDir,
    templates,
    run: (bin: string, args: string[]) => {
      commands.push([bin, ...args]);
    },
  };
  const dry = runInstaller({ ...options, apply: false, uninstall: false });
  assert.match(dry, /dry run/i);
  assert.match(dry, /-- >>> hub/);
  assert.match(dry, /\+.*"hub"/);
  assert.equal(commands.length, 0);
  assert.deepEqual(readdirSync(caelestia).toSorted(), ['cli.json', 'hypr-user.conf', 'hypr-user.lua']);
  assert.deepEqual(readdirSync(root).toSorted(), ['config']);
  runInstaller({ ...options, apply: true, uninstall: false });
  assert.ok(commands.some((c) => c.join(' ') === 'pnpm --filter @hub/web build'));
  const backups = readdirSync(caelestia).filter((p) => p.includes('.hub-backup-'));
  assert.equal(backups.length, 2);
  assert.equal(
    readFileSync(join(caelestia, backups.find((p) => p.startsWith('hypr-user.lua')) ?? ''), 'utf8'),
    original.hyprland,
  );
  assert.match(readFileSync(join(configDir, 'systemd/user/hub.service'), 'utf8'), /ExecStart/);
  const fileList = readdirSync(caelestia).toSorted();
  const stateFiles = readdirSync(stateDir).toSorted();
  runInstaller({ ...options, apply: true, uninstall: false });
  assert.deepEqual(readdirSync(caelestia).toSorted(), fileList);
  assert.deepEqual(readdirSync(stateDir).toSorted(), stateFiles);
  const installedLua = readFileSync(lua, 'utf8');
  runInstaller({ ...options, apply: false, uninstall: true });
  assert.equal(readFileSync(lua, 'utf8'), installedLua);
  runInstaller({ ...options, apply: true, uninstall: true });
  assert.equal(readFileSync(lua, 'utf8'), original.hyprland);
  assert.equal(readFileSync(cli, 'utf8'), original.cli);
  assert.equal(readFileSync(legacy, 'utf8'), 'legacy must stay untouched');
  assert.ok(!readdirSync(join(configDir, 'systemd/user')).includes('hub.service'));
});

void test('a failed build leaves all desktop files unchanged', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-build-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () =>
      runInstaller({
        repo: '/opt/hub',
        node: process.execPath,
        configDir: join(root, 'config'),
        stateDir: join(root, 'state'),
        templates,
        apply: true,
        uninstall: false,
        run: () => {
          throw new Error('build failed');
        },
      }),
    /build failed/,
  );
  assert.deepEqual(readdirSync(root), []);
});

void test('the persisted manifest recovers an interrupted service upgrade', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-recovery-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const configDir = join(root, 'config');
  const stateDir = join(root, 'state');
  mkdirSync(join(configDir, 'caelestia'), { recursive: true });
  mkdirSync(join(configDir, 'systemd/user'), { recursive: true });
  mkdirSync(stateDir);
  const first = prepareInstall(original, templates, null);
  const updatedTemplates = { ...templates, service: templates.service.replace('/opt/node', '/opt/new-node') };
  const upgrade = prepareInstall(first.next, updatedTemplates, first.state);
  writeFileSync(join(configDir, 'systemd/user/hub.service'), first.next.service ?? '');
  writeFileSync(join(configDir, 'caelestia/hypr-user.lua'), first.next.hyprland ?? '');
  writeFileSync(join(configDir, 'caelestia/cli.json'), first.next.cli ?? '');
  writeFileSync(join(stateDir, 'desktop-install.json'), JSON.stringify({ ...upgrade.state, pending: first.next }));
  const options = {
    repo: '/opt/hub',
    node: process.execPath,
    configDir,
    stateDir,
    templates: updatedTemplates,
    apply: true,
    run: () => {},
  };
  runInstaller({ ...options, uninstall: false });
  assert.equal(readFileSync(join(configDir, 'systemd/user/hub.service'), 'utf8'), upgrade.next.service);
  runInstaller({ ...options, uninstall: true });
  assert.equal(readFileSync(join(configDir, 'caelestia/hypr-user.lua'), 'utf8'), original.hyprland);
  assert.equal(readFileSync(join(configDir, 'caelestia/cli.json'), 'utf8'), original.cli);
});

void test('an edit during the build aborts before writing any desktop file', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hub-concurrent-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const configDir = join(root, 'config');
  const caelestia = join(configDir, 'caelestia');
  mkdirSync(caelestia, { recursive: true });
  const lua = join(caelestia, 'hypr-user.lua');
  writeFileSync(lua, '-- original\n');
  assert.throws(
    () =>
      runInstaller({
        repo: '/opt/hub',
        node: process.execPath,
        configDir,
        stateDir: join(root, 'state'),
        templates,
        apply: true,
        uninstall: false,
        run: () => {
          writeFileSync(lua, '-- edited during build\n');
        },
      }),
    /changed/i,
  );
  assert.deepEqual(readdirSync(configDir), ['caelestia']);
  assert.equal(readFileSync(lua, 'utf8'), '-- edited during build\n');
});
