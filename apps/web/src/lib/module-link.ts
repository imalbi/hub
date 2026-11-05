import type { TRPCLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';

// Far above any count a page reaches, and far below Number.MAX_SAFE_INTEGER for a few hundred modules.
const ID_STRIDE = 1_000_000_000;
let clients = 0;

/** Each module client takes its own block of ids; the main client keeps the low ones it counts up from. */
export const nextIdBase = () => ++clients * ID_STRIDE;

/** Prefixes the path with the module name and moves the id into the module's block. */
export function namespaceOperation<T extends { id: number; path: string }>(op: T, name: string, base: number): T {
  return { ...op, id: base + op.id, path: `${name}.${op.path}` };
}

/**
 * Module clients and the main client share one WebSocket, and a socket keys its requests by operation id. Each
 * tRPC client counts its ids from 1, so without a block of its own a module's subscription could take an id the
 * main client already uses and be refused as a duplicate.
 */
export function moduleLink(name: string): TRPCLink<AnyRouter> {
  const base = nextIdBase();
  return () =>
    ({ op, next }) =>
      observable((observer) => next(namespaceOperation(op, name, base)).subscribe(observer));
}
