import type { AnyProcedure, AnyRouter } from '@trpc/server';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import type { Run } from './exec.ts';

/** What a discovered (private or example) module gets: never the core database. */
export type DiscoveredDeps = {
  run: Run;
  fetch: typeof fetch;
  log: FastifyBaseLogger;
  /** Shared with the layout module; only successfully created modules add zones. */
  zones: Set<string>;
};
/** What a public module gets: the discovered deps plus the core database. */
export type ModuleDeps = DiscoveredDeps & { db: Db };
export type ModuleInstance = { router: AnyRouter | AnyProcedure; close?: () => void | Promise<void> };
export type ModuleDefinition = {
  name: string;
  config?: z.ZodType;
  zones?: readonly string[];
  create: (deps: ModuleDeps & { config: unknown }) => ModuleInstance;
};

/**
 * `migrations` (absolute path of the module's own Drizzle folder, discovered modules only) gives the module its own
 * SQLite file as `deps.db`; `coreDb: true` (public modules only, discovery
 * refuses it) gives the core one; a module that declares neither has no `db` at all.
 */
export function defineModule<
  const N extends string,
  S extends z.ZodType = z.ZodUndefined,
  R extends ModuleInstance = ModuleInstance,
  M extends string | undefined = undefined,
  C extends true | undefined = undefined,
>(definition: {
  name: N;
  config?: S;
  zones?: readonly string[];
  migrations?: M;
  coreDb?: C;
  create: (
    deps: DiscoveredDeps &
      (M extends string ? { db: Db } : C extends true ? { db: Db } : unknown) & {
        config: z.output<S>;
      },
  ) => R;
}) {
  return {
    ...definition,
    create(deps: DiscoveredDeps & { db?: Db; config: unknown }): R {
      const config = (definition.config ?? z.undefined()).parse(deps.config);
      // The factory's parameter is conditional on `migrations`/`coreDb`, and its config type is the schema's output:
      // the schema just parsed it, and the caller passes `db` exactly when the definition declared one of the two.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Conditional deps and parsed config are promised by the signature.
      return definition.create({ ...deps, config } as Parameters<typeof definition.create>[0]);
    },
  };
}

export function moduleConfigShape<const T extends readonly ModuleDefinition[]>(modules: T) {
  type Shape = {
    [M in T[number] as NonNullable<M['config']> extends z.ZodUndefined ? never : M['name']]: NonNullable<M['config']>;
  };
  // fromEntries loses the literal-name/schema correlation, preserved by the mapped type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object entries erase mapped literal keys. // guard-private: allow Lint rule name, not a token
  return Object.fromEntries(modules.filter((m) => m.config).map((m) => [m.name, m.config])) as Shape;
}

export { z };
