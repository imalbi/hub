import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { mkdir, lstat, readFile, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { TRPCError } from '@trpc/server';
import type { Db } from '../db/index.ts';
import { catalogState, installedModules, moduleSources } from '../db/schema.ts';
import {
  copyModuleAtomically,
  deriveSourceId,
  isAllowedGitUrl,
  parseCatalogManifest,
  RESERVED_CORE_NAMES,
  resolveSafeModulePath,
  type CatalogManifest,
} from './catalog-manifest.ts';
import { installedRoot, moduleNameSchema, privateRoot, reposRoot } from './discovery.ts';
import type { Run } from './exec.ts';
import type { createJobRunner } from './jobs.ts';

export const HARDENED_GIT_FLAGS = [
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.symlinks=false',
  '-c',
  'submodule.recurse=false',
] as const;

const GIT_ENV = { GIT_TERMINAL_PROMPT: '0' };
const DEFAULT_BUILD_COMMAND = { bin: 'pnpm', args: ['--filter', '@hub/web', 'build'] };

export type CatalogJobSummary = ReturnType<ReturnType<typeof createJobRunner>['list']>[number];

export type CatalogSourceModuleView = {
  name: string;
  title: string;
  description: string;
  version: string;
  path: string;
  minHubVersion?: string;
  installed: boolean;
  installedFromOtherSource: boolean;
  installedVersion: string | null;
  installedCommit: string | null;
  updateAvailable: boolean;
  localConflict: boolean;
};

export type CatalogSourceView = {
  id: string;
  name: string;
  description: string;
  url: string;
  commitSha: string;
  addedAt: number;
  lastSyncedAt: number;
  syncError: string | null;
  manifestError: string | null;
  modules: CatalogSourceModuleView[];
};

export type CatalogInstalledView = {
  name: string;
  sourceId: string;
  modulePath: string;
  title: string;
  description: string;
  version: string;
  installedCommit: string;
  installedAt: number;
  updatedAt: number;
  localConflict: boolean;
  updateAvailable: boolean;
};

export type CatalogState = {
  sources: CatalogSourceView[];
  installed: CatalogInstalledView[];
  pendingApply: boolean;
  canRestart: boolean;
  buildJob: CatalogJobSummary | null;
};

export type CatalogOptions = {
  db: Db;
  run: Run;
  jobs: ReturnType<typeof createJobRunner>;
  reposDir?: string;
  installedDir?: string;
  localDir?: string;
  reservedNames?: ReadonlySet<string>;
  buildCommand?: { bin: string; args: string[] };
  gitTimeoutMs?: number;
  buildTimeoutMs?: number;
  onRestart?: () => void;
};

const MAX_MANIFEST_BYTES = 256 * 1024;

async function readManifestFromRepo(repoPath: string, reservedNames: ReadonlySet<string>): Promise<CatalogManifest> {
  const manifestPath = join(repoPath, 'hub-catalog.json');
  let info;
  try {
    info = await lstat(manifestPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error('Missing hub-catalog.json', { cause: error });
    }
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('hub-catalog.json must be a regular file');
  if (info.size > MAX_MANIFEST_BYTES) throw new Error('hub-catalog.json exceeds size limit');
  const rawText = await readFile(manifestPath, 'utf8');
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error('Invalid JSON in hub-catalog.json');
  }
  const manifest = parseCatalogManifest(parsedJson, reservedNames);
  for (const mod of manifest.modules) {
    await resolveSafeModulePath(repoPath, mod.path);
  }
  return manifest;
}

function summarizeError(error: unknown, fallback: string) {
  if (error instanceof TRPCError) return error.message;
  // Raw fs/errno errors often carry absolute OS paths in `.message`.
  if (error instanceof Error && 'code' in error) return fallback;
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 240);
  return fallback;
}

export function createCatalogService({
  db,
  run,
  jobs,
  reposDir = reposRoot,
  installedDir = installedRoot,
  localDir = privateRoot,
  reservedNames = RESERVED_CORE_NAMES,
  buildCommand = DEFAULT_BUILD_COMMAND,
  gitTimeoutMs = 30_000,
  buildTimeoutMs = 600_000,
  onRestart,
}: CatalogOptions) {
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };

  let closed = false;
  const watchers = new Set<AbortController>();

  const git = (args: readonly string[]) =>
    run('git', [...HARDENED_GIT_FLAGS, ...args], { timeoutMs: gitTimeoutMs, env: GIT_ENV });

  async function readHeadSha(repoPath: string) {
    const rev = await git(['-C', repoPath, 'rev-parse', 'HEAD']);
    const sha = rev.stdout.trim();
    if (rev.code !== 0 || !/^[0-9a-f]{7,64}$/i.test(sha)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not read repository HEAD commit' });
    }
    return sha;
  }

  async function getPendingApply() {
    const [row] = await db.select().from(catalogState).where(eq(catalogState.id, 1));
    return row?.pendingApply ?? false;
  }

  async function setPendingApply(pendingApply: boolean) {
    const now = new Date();
    await db
      .insert(catalogState)
      .values({ id: 1, pendingApply, updatedAt: now })
      .onConflictDoUpdate({
        target: catalogState.id,
        set: { pendingApply, updatedAt: now },
      });
  }

  function hasLocalConflict(name: string) {
    return existsSync(join(localDir, name));
  }

  async function readManifestSafe(
    repoPath: string,
  ): Promise<{ manifest: CatalogManifest; error: null } | { manifest: null; error: string }> {
    try {
      const manifest = await readManifestFromRepo(repoPath, reservedNames);
      return { manifest, error: null };
    } catch (error) {
      return { manifest: null, error: summarizeError(error, 'Invalid hub-catalog.json manifest') };
    }
  }

  function isBuildRunning() {
    return (
      watchers.size > 0 ||
      jobs.list().some((job) => job.action === 'catalog.build' && (job.status === 'queued' || job.status === 'running'))
    );
  }

  async function state(): Promise<CatalogState> {
    const [sources, installedRows, pendingApply] = await Promise.all([
      db.select().from(moduleSources),
      db.select().from(installedModules),
      getPendingApply(),
    ]);
    const installedByName = new Map(installedRows.map((row) => [row.name, row]));
    const sourceById = new Map(sources.map((row) => [row.id, row]));
    const manifestBySource = new Map<string, CatalogManifest>();

    const sourceViews: CatalogSourceView[] = await Promise.all(
      sources
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map(async (source) => {
          const read = await readManifestSafe(source.localPath);
          if (read.manifest) manifestBySource.set(source.id, read.manifest);
          const modules: CatalogSourceModuleView[] = (read.manifest?.modules ?? []).map((entry) => {
            const existing = installedByName.get(entry.name);
            const fromThisSource = existing?.sourceId === source.id;
            const updateAvailable =
              fromThisSource &&
              existing !== undefined &&
              (existing.version !== entry.version || existing.installedCommit !== source.commitSha);
            return {
              name: entry.name,
              title: entry.title,
              description: entry.description,
              version: entry.version,
              path: entry.path,
              ...(entry.minHubVersion && { minHubVersion: entry.minHubVersion }),
              installed: fromThisSource,
              installedFromOtherSource: Boolean(existing && existing.sourceId !== source.id),
              installedVersion: existing ? existing.version : null,
              installedCommit: existing ? existing.installedCommit : null,
              updateAvailable,
              localConflict: hasLocalConflict(entry.name),
            };
          });
          return {
            id: source.id,
            name: source.name,
            description: source.description,
            url: source.url,
            commitSha: source.commitSha,
            addedAt: source.addedAt.getTime(),
            lastSyncedAt: source.lastSyncedAt.getTime(),
            syncError: source.syncError ?? null,
            manifestError: read.error,
            modules,
          };
        }),
    );

    const installed: CatalogInstalledView[] = installedRows
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((row) => {
        const source = sourceById.get(row.sourceId);
        const manifest = manifestBySource.get(row.sourceId);
        const entry = manifest?.modules.find((mod) => mod.name === row.name);
        const updateAvailable = Boolean(
          source && entry && (entry.version !== row.version || source.commitSha !== row.installedCommit),
        );
        return {
          name: row.name,
          sourceId: row.sourceId,
          modulePath: row.modulePath,
          title: row.title,
          description: row.description,
          version: row.version,
          installedCommit: row.installedCommit,
          installedAt: row.installedAt.getTime(),
          updatedAt: row.updatedAt.getTime(),
          localConflict: hasLocalConflict(row.name),
          updateAvailable,
        };
      });

    const buildJob = jobs.list().find((job) => job.action === 'catalog.build') ?? null;

    return {
      sources: sourceViews,
      installed,
      pendingApply,
      canRestart: Boolean(onRestart),
      buildJob,
    };
  }

  function addSource({ url }: { url: string }) {
    return serialized(async () => {
      if (!isAllowedGitUrl(url)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid Git repository URL' });
      }
      const existingRows = await db.select().from(moduleSources);
      if (existingRows.some((row) => row.url === url)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Catalog repository already registered' });
      }
      const id = deriveSourceId(url, new Set(existingRows.map((row) => row.id)));
      await mkdir(reposDir, { recursive: true });
      const localPath = join(reposDir, id);
      await rm(localPath, { recursive: true, force: true });
      try {
        const cloned = await git(['clone', '--depth', '1', '--', url, localPath]);
        if (cloned.code !== 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Git clone failed' });
        }
        const commitSha = await readHeadSha(localPath);
        let manifest: CatalogManifest;
        try {
          manifest = await readManifestFromRepo(localPath, reservedNames);
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: summarizeError(error, 'Invalid hub-catalog.json manifest'),
          });
        }
        const now = new Date();
        await db.insert(moduleSources).values({
          id,
          name: manifest.name,
          description: manifest.description,
          url,
          localPath,
          commitSha,
          addedAt: now,
          lastSyncedAt: now,
          syncError: null,
        });
        return { id, name: manifest.name, commitSha };
      } catch (error) {
        await rm(localPath, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    });
  }

  function syncSource({ id }: { id: string }) {
    return serialized(async () => {
      const [source] = await db.select().from(moduleSources).where(eq(moduleSources.id, id));
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Catalog repository not found' });

      const fetched = await git(['-C', source.localPath, 'fetch', '--depth', '1', 'origin']);
      if (fetched.code !== 0) {
        const error = 'Git fetch failed';
        await db.update(moduleSources).set({ syncError: error }).where(eq(moduleSources.id, id));
        return { ok: false as const, error, commitSha: source.commitSha };
      }

      const reset = await git(['-C', source.localPath, 'reset', '--hard', 'FETCH_HEAD']);
      if (reset.code !== 0) {
        const error = 'Git reset failed';
        await db.update(moduleSources).set({ syncError: error }).where(eq(moduleSources.id, id));
        return { ok: false as const, error, commitSha: source.commitSha };
      }

      let commitSha: string;
      let manifest: CatalogManifest;
      try {
        commitSha = await readHeadSha(source.localPath);
        manifest = await readManifestFromRepo(source.localPath, reservedNames);
      } catch (error) {
        await git(['-C', source.localPath, 'reset', '--hard', source.commitSha]).catch(() => undefined);
        const message = summarizeError(error, 'Invalid hub-catalog.json manifest');
        await db.update(moduleSources).set({ syncError: message }).where(eq(moduleSources.id, id));
        return { ok: false as const, error: message, commitSha: source.commitSha };
      }

      await db
        .update(moduleSources)
        .set({
          name: manifest.name,
          description: manifest.description,
          commitSha,
          lastSyncedAt: new Date(),
          syncError: null,
        })
        .where(eq(moduleSources.id, id));

      return { ok: true as const, commitSha };
    });
  }

  function removeSource({ id }: { id: string }) {
    return serialized(async () => {
      const [source] = await db.select().from(moduleSources).where(eq(moduleSources.id, id));
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Catalog repository not found' });

      const dependent = await db.select().from(installedModules).where(eq(installedModules.sourceId, id));
      if (dependent.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Remove installed modules from this catalog first',
        });
      }

      if (existsSync(source.localPath)) {
        const realBase = await realpath(reposDir).catch(() => reposDir);
        const realRepo = await realpath(source.localPath);
        const rel = relative(realBase, realRepo);
        if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Repository path escapes managed directory' });
        }
        await rm(realRepo, { recursive: true, force: true });
      }

      await db.delete(moduleSources).where(eq(moduleSources.id, id));
      return { removed: true as const };
    });
  }

  function installModule({ sourceId, name }: { sourceId: string; name: string }) {
    return serialized(async () => {
      if (isBuildRunning()) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Cannot modify modules while a catalog build is running' });
      }
      const parsedName = moduleNameSchema.safeParse(name);
      if (!parsedName.success) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid module name' });
      if (reservedNames.has(name)) throw new TRPCError({ code: 'CONFLICT', message: 'Module name is reserved' });
      if (hasLocalConflict(name)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Module is overridden by a local module' });
      }

      const [existing] = await db.select().from(installedModules).where(eq(installedModules.name, name));
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Module is already installed' });

      const [source] = await db.select().from(moduleSources).where(eq(moduleSources.id, sourceId));
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Catalog repository not found' });

      let manifest: CatalogManifest;
      try {
        manifest = await readManifestFromRepo(source.localPath, reservedNames);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: summarizeError(error, 'Invalid hub-catalog.json manifest'),
        });
      }

      const entry = manifest.modules.find((mod) => mod.name === name);
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: 'Module not found in catalog' });

      let resolvedSourceDir: string;
      try {
        resolvedSourceDir = await resolveSafeModulePath(source.localPath, entry.path);
      } catch (error) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: summarizeError(error, 'Invalid module path') });
      }

      await copyModuleAtomically(resolvedSourceDir, installedDir, name);
      const now = new Date();
      await db.insert(installedModules).values({
        name,
        sourceId: source.id,
        modulePath: entry.path,
        title: entry.title,
        description: entry.description,
        version: entry.version,
        installedCommit: source.commitSha,
        installedAt: now,
        updatedAt: now,
      });
      await setPendingApply(true);

      return { name, version: entry.version, commitSha: source.commitSha, pendingApply: true as const };
    });
  }

  function updateModule({ name }: { name: string }) {
    return serialized(async () => {
      if (isBuildRunning()) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Cannot modify modules while a catalog build is running' });
      }
      const parsedName = moduleNameSchema.safeParse(name);
      if (!parsedName.success) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid module name' });

      const [installed] = await db.select().from(installedModules).where(eq(installedModules.name, name));
      if (!installed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Module is not installed' });
      if (hasLocalConflict(name)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Module is overridden by a local module' });
      }

      const [source] = await db.select().from(moduleSources).where(eq(moduleSources.id, installed.sourceId));
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Catalog repository not found' });

      let manifest: CatalogManifest;
      try {
        manifest = await readManifestFromRepo(source.localPath, reservedNames);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: summarizeError(error, 'Invalid hub-catalog.json manifest'),
        });
      }

      const entry = manifest.modules.find((mod) => mod.name === name);
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND', message: 'Module no longer exists in catalog' });

      let resolvedSourceDir: string;
      try {
        resolvedSourceDir = await resolveSafeModulePath(source.localPath, entry.path);
      } catch (error) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: summarizeError(error, 'Invalid module path') });
      }

      await copyModuleAtomically(resolvedSourceDir, installedDir, name);
      await db
        .update(installedModules)
        .set({
          modulePath: entry.path,
          title: entry.title,
          description: entry.description,
          version: entry.version,
          installedCommit: source.commitSha,
          updatedAt: new Date(),
        })
        .where(eq(installedModules.name, name));
      await setPendingApply(true);

      return { name, version: entry.version, commitSha: source.commitSha, pendingApply: true as const };
    });
  }

  function removeModule({ name }: { name: string }) {
    return serialized(async () => {
      if (isBuildRunning()) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Cannot modify modules while a catalog build is running' });
      }
      const parsedName = moduleNameSchema.safeParse(name);
      if (!parsedName.success) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid module name' });

      const [installed] = await db.select().from(installedModules).where(eq(installedModules.name, name));
      if (!installed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Module is not installed' });

      // Remove only the module source folder; its SQLite file under `<dbDir>/modules/<name>.db` stays intact.
      await rm(join(installedDir, name), { recursive: true, force: true });
      await db.delete(installedModules).where(eq(installedModules.name, name));
      await setPendingApply(true);

      return { name, removed: true as const, pendingApply: true as const };
    });
  }

  function watchBuildJob(jobId: string) {
    const controller = new AbortController();
    watchers.add(controller);
    void (async () => {
      try {
        for await (const list of jobs.updates(controller.signal)) {
          if (closed) break;
          const job = list.find((item) => item.id === jobId);
          if (!job) break;
          if (job.status === 'queued' || job.status === 'running') continue;
          if (job.status === 'completed' && job.exitCode === 0) {
            await setPendingApply(false);
            if (!closed) onRestart?.();
          }
          break;
        }
      } catch {
        // Aborted on server close or stream end.
      } finally {
        watchers.delete(controller);
      }
    })();
  }

  function apply() {
    return serialized(async () => {
      if (isBuildRunning()) {
        throw new TRPCError({ code: 'CONFLICT', message: 'A catalog build is already running' });
      }
      const jobId = jobs.start('catalog.build', buildCommand.bin, buildCommand.args, buildTimeoutMs);
      watchBuildJob(jobId);
      return { jobId, restarting: Boolean(onRestart) };
    });
  }

  function close() {
    closed = true;
    for (const controller of watchers) controller.abort();
    watchers.clear();
  }

  return {
    state,
    addSource,
    syncSource,
    removeSource,
    installModule,
    updateModule,
    removeModule,
    apply,
    close,
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
