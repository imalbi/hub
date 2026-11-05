import type { AnyProcedure, AnyRouter } from '@trpc/server';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import type { Run } from './exec.ts';

export type ModuleDeps = {
  db: Db;
  run: Run;
  fetch: typeof fetch;
  log: FastifyBaseLogger;
  /** Shared with the layout module; only successfully created modules add zones. */
  zones: Set<string>;
};
export type ModuleInstance = { router: AnyRouter | AnyProcedure; close?: () => void | Promise<void> };
export type ModuleDefinition = {
  name: string;
  config?: z.ZodType;
  zones?: readonly string[];
  create: (deps: ModuleDeps & { config: unknown }) => ModuleInstance;
};

export function defineModule<
  const N extends string,
  S extends z.ZodType = z.ZodUndefined,
  R extends ModuleInstance = ModuleInstance,
>(definition: {
  name: N;
  config?: S;
  zones?: readonly string[];
  create: (deps: ModuleDeps & { config: z.output<S> }) => R;
}) {
  return {
    ...definition,
    create(deps: ModuleDeps & { config: unknown }): R {
      // Zod's generic output is the type promised to the factory after parsing its own schema.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The selected schema validates its generic output.
      const config = (definition.config ?? z.undefined()).parse(deps.config) as z.output<S>;
      return definition.create({ ...deps, config });
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
