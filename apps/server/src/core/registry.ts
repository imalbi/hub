/* oxlint-disable no-underscore-dangle -- tRPC exposes procedures, inputs and metadata through _def. */
import type { AnyProcedure, AnyRouter } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from './trpc.ts';

const metadata = z.object({
  label: z.string().trim().min(1),
  description: z.string().min(1),
  danger: z.boolean().default(false),
  pageOnly: z.boolean().default(false),
  job: z.boolean().default(false),
  timeoutMs: z.number().int().positive().optional(),
});

function isProcedure(value: unknown): value is AnyProcedure {
  return typeof value === 'function' && '_def' in value;
}

// tRPC serialization loses named JSON Schema fields behind zod's open index signature.
type SchemaFields = {
  [K in keyof z.core.JSONSchema.BaseSchema as string extends K ? never : K]: z.core.JSONSchema.BaseSchema[K];
};
type RegistrySchema = Omit<SchemaFields, 'properties'> & { properties?: Record<string, RegistrySchema | boolean> };

function inputSchema(inputs: AnyProcedure['_def']['inputs']): RegistrySchema | null {
  if (!inputs.length) return null;
  try {
    const schemas = inputs.map((input) => {
      if (!(input instanceof z.ZodType)) throw new Error('Unsupported parser');
      return z.toJSONSchema(input, { io: 'input' });
    });
    const first = schemas[0];
    if (schemas.length === 1 && first?.type === 'object') return first;
    return { type: 'object', allOf: schemas };
  } catch {
    // An opaque parser stays discoverable, but no generated client may guess its input.
    return { type: 'object', not: {} };
  }
}

export function listActions(app: AnyRouter) {
  return Object.entries<unknown>(app._def.procedures).flatMap(([path, procedure]) => {
    if (!isProcedure(procedure)) return [];
    const kind = procedure._def.type;
    if (kind !== 'mutation' && kind !== 'query') return [];
    // A private module escapes the repo typecheck: an action with bad metadata is left out, not the whole list.
    const meta = metadata.safeParse(procedure._def.meta);
    return meta.success ? [{ path, kind, ...meta.data, schema: inputSchema(procedure._def.inputs) }] : [];
  });
}

export function createRegistryRouter(app: () => AnyRouter) {
  return router({ list: protectedProcedure.query(() => listActions(app()).filter((action) => !action.pageOnly)) });
}
