import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { validRange } from 'semver';
import { z } from 'zod';
import { moduleNameSchema } from './discovery.ts';

export const RESERVED_CORE_NAMES: ReadonlySet<string> = new Set([
  'registry',
  'settings',
  'modules',
  'agents',
  'confirmations',
  'backup',
  'assistant',
  'jobs',
  'catalog',
]);

const safeRelativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !value.includes('\0') && !value.includes('\\'), 'Invalid path character')
  .refine((value) => !value.startsWith('/') && !/^[A-Za-z]:/.test(value), 'Path must be relative')
  .refine((value) => {
    const segments = value.split('/');
    return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  }, 'Path traversal is not allowed');

export const catalogModuleEntrySchema = z.strictObject({
  name: moduleNameSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  version: z.string().trim().min(1).max(64),
  path: safeRelativePathSchema,
  minHubVersion: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => validRange(value) !== null, 'Invalid semver range')
    .optional(),
  provides: z.array(moduleNameSchema).optional(),
  requires: z.array(moduleNameSchema).optional(),
  optional: z.record(moduleNameSchema, z.string().trim().min(1).max(500)).optional(),
});

export const catalogManifestSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  modules: z.array(catalogModuleEntrySchema).max(100),
});

export type CatalogModuleEntry = z.infer<typeof catalogModuleEntrySchema>;
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

/** Validates a `hub-catalog.json` object, rejecting duplicate or reserved module names. */
export function parseCatalogManifest(
  raw: unknown,
  reserved: ReadonlySet<string> = RESERVED_CORE_NAMES,
): CatalogManifest {
  const manifest = catalogManifestSchema.parse(raw);
  const seen = new Set<string>();
  for (const mod of manifest.modules) {
    if (reserved.has(mod.name)) throw new Error(`Reserved module name: ${mod.name}`);
    if (seen.has(mod.name)) throw new Error(`Duplicate module name in catalog: ${mod.name}`);
    seen.add(mod.name);
  }
  return manifest;
}

function hasValidRepoSegments(segments: readonly string[]) {
  if (segments.length === 0) return false;
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return false;
  const last = segments.at(-1) ?? '';
  const stripped = last.endsWith('.git') ? last.slice(0, -4) : last;
  return stripped.length > 0;
}

/**
 * Allows only `https://...`, `git@<host>:<path>`, and `ssh://git@<host>[:port]/<path>`.
 * Rejects leading dashes, whitespace, control characters, queries/fragments, `file://`, and `ext::`.
 */
export function isAllowedGitUrl(url: string): boolean {
  if (!url || url.length > 2048 || url.startsWith('-')) return false;
  // Control characters and whitespace must never enter git CLI arguments.
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return false;
  }
  if (url.startsWith('https://') || url.startsWith('ssh://')) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.search || parsed.hash || parsed.password) return false;
    if (!parsed.hostname || parsed.hostname.startsWith('-')) return false;
    if (parsed.protocol === 'https:') {
      if (parsed.username) return false;
    } else if (parsed.username !== 'git') {
      return false;
    }
    const segments = parsed.pathname.split('/').filter((segment, index) => !(index === 0 && segment === ''));
    if (segments.some((segment) => segment.startsWith('-'))) return false;
    return hasValidRepoSegments(segments);
  }
  const scpMatch = /^git@([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?):([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/.exec(
    url,
  );
  if (!scpMatch?.[2]) return false;
  const path = scpMatch[2];
  if (path.startsWith('-')) return false;
  return hasValidRepoSegments(path.split('/'));
}

/** Derives a safe unique folder slug for a catalog repository URL. */
export function deriveSourceId(url: string, existingIds: ReadonlySet<string>): string {
  const tail = (url.split(/[/:]/).filter(Boolean).at(-1) ?? 'catalog').replace(/\.git$/i, '');
  const cleaned = tail
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const base = /^[a-z0-9]/.test(cleaned) ? cleaned : 'catalog';
  if (!existingIds.has(base)) return base;
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 6);
  const hashed = `${base.slice(0, 32)}-${hash}`;
  if (!existingIds.has(hashed)) return hashed;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, 32)}-${i}`;
    if (!existingIds.has(candidate)) return candidate;
  }
}

/** Rejects any symlink, special file, or nested `.git` directory inside a module tree. */
export async function assertNoSymlinks(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') throw new Error('Committed node_modules is not allowed in module');
    if (entry.name === '.git') throw new Error('Nested .git directory is not allowed in module');
    const full = join(dir, entry.name);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error(`Symlink not allowed inside module: ${entry.name}`);
    if (info.isDirectory()) {
      await assertNoSymlinks(full);
    } else if (!info.isFile()) {
      throw new Error(`Unsupported file type inside module: ${entry.name}`);
    }
  }
}

/** Proves `relativePath` resolves strictly inside `repoRoot` without symlinks and contains `server.ts`. */
export async function resolveSafeModulePath(repoRoot: string, relativePath: string): Promise<string> {
  const validated = safeRelativePathSchema.parse(relativePath);
  const segments = validated.split('/');
  let cursor = repoRoot;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    const component = await lstat(cursor);
    if (component.isSymbolicLink()) throw new Error(`Symlink in module path: ${segment}`);
  }
  const realRepo = await realpath(repoRoot);
  const realTarget = await realpath(cursor);
  const rel = relative(realRepo, realTarget);
  if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel))
    throw new Error('Module path escapes repository root');
  const targetInfo = await lstat(realTarget);
  if (!targetInfo.isDirectory()) throw new Error('Module path is not a directory');
  const entryFile = await lstat(join(realTarget, 'server.ts'));
  if (!entryFile.isFile() || entryFile.isSymbolicLink()) throw new Error('Module server.ts must be a regular file');
  await assertNoSymlinks(realTarget);
  await assertModulePackage(realTarget);
  return realTarget;
}

async function assertModulePackage(dir: string) {
  const pkg = await lstat(join(dir, 'package.json')).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!pkg) return;
  if (!pkg.isFile() || pkg.isSymbolicLink()) throw new Error('Module package.json must be a regular file');
  const lock = await lstat(join(dir, 'pnpm-lock.yaml')).catch(() => undefined);
  if (!lock?.isFile() || lock.isSymbolicLink()) throw new Error('Module package.json requires pnpm-lock.yaml');
}

async function copyTreeNoSymlinks(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir);
  for (const name of entries) {
    if (name === 'node_modules') throw new Error('Committed node_modules is not allowed in module');
    if (name === '.git') throw new Error('Nested .git directory is not allowed in module');
    const src = join(sourceDir, name);
    const dst = join(targetDir, name);
    const info = await lstat(src);
    if (info.isSymbolicLink()) throw new Error(`Symlink not allowed inside module: ${name}`);
    if (info.isDirectory()) {
      await copyTreeNoSymlinks(src, dst);
    } else if (info.isFile()) {
      await copyFile(src, dst);
    } else {
      throw new Error(`Unsupported file type inside module: ${name}`);
    }
  }
}

async function statIfPresent(path: string) {
  return lstat(path).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
}

async function preserveLocalFiles(previous: string, staging: string): Promise<void> {
  const previousInfo = await lstat(previous);
  const stagingInfo = await lstat(staging);
  if (!previousInfo.isDirectory() || !stagingInfo.isDirectory()) {
    throw new Error('Module configuration requires regular directories');
  }
  for (const name of await readdir(previous)) {
    if (name === 'node_modules' || name === '.git') continue;
    const source = join(previous, name);
    const target = join(staging, name);
    const info = await lstat(source);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      const destination = await statIfPresent(target);
      if (destination && !destination.isDirectory()) continue;
      await mkdir(target, { recursive: true });
      await preserveLocalFiles(source, target);
      // Avoid retaining obsolete source directories that contain no local configuration.
      if (!destination && (await readdir(target)).length === 0) await rm(target, { recursive: true });
    } else if (info.isFile() && /\.local\..+$/.test(name) && !(await statIfPresent(target))) {
      await copyFile(source, target);
    }
  }
}

/** Stages a module tree in a temporary folder, verifies `server.ts` and zero symlinks, then swaps atomically. */
export async function copyModuleAtomically(
  sourceDir: string,
  installedDir: string,
  moduleName: string,
  prepare?: (staging: string) => Promise<void>,
): Promise<void> {
  const safeName = moduleNameSchema.parse(moduleName);
  await assertNoSymlinks(sourceDir);
  await assertModulePackage(sourceDir);
  await mkdir(installedDir, { recursive: true });
  const staging = join(installedDir, `.tmp-${safeName}-${randomUUID()}`);
  const target = join(installedDir, safeName);
  const backup = join(installedDir, `.bak-${safeName}-${randomUUID()}`);
  let movedPrevious = false;
  try {
    await copyTreeNoSymlinks(sourceDir, staging);
    const serverStat = await lstat(join(staging, 'server.ts'));
    if (!serverStat.isFile() || serverStat.isSymbolicLink()) throw new Error('Module server.ts must be a regular file');
    const existing = await statIfPresent(target);
    if (existing) await preserveLocalFiles(target, staging);
    await prepare?.(staging);
    if (existing) {
      await rename(target, backup);
      movedPrevious = true;
    }
    await rename(staging, target);
    if (movedPrevious) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    if (movedPrevious) {
      const targetExists = await lstat(target).catch(() => undefined);
      if (!targetExists) await rename(backup, target).catch(() => undefined);
    }
    throw error;
  }
}
