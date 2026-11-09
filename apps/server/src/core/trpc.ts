import type { Files } from './files.ts';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Client, DeviceSockets } from './auth.ts';
import type { CoreConfig } from './config-schema.ts';
import type { Db } from '../db/index.ts';
import type { Run } from './exec.ts';
/** Registry metadata for an action (a mutation). Later steps derive LLM tools and the danger check from it. */
export type ActionMeta = {
  /** Short Italian label shared by registry interfaces. */
  label: string;
  /** English, written for an LLM: what the action does, not how it is labelled in the UI. */
  description: string;
  /** Refused unless the input carries `confirmed: true`, set only by a hold-to-confirm (see `confirmDanger`). */
  danger?: boolean;
};

export type Context = {
  db: Db;
  run: Run;
  config: CoreConfig;
  files: Files;
  /** Who is calling, decided once per request (per connection for a WebSocket) in `createContext`. */
  client: Client;
  remoteAddress: string;
  sockets: DeviceSockets;
  /** Restart once the response to this request is sent (only a settings save asks); false when nothing will restart. */
  restart: () => boolean;
};

const t = initTRPC.context<Context>().meta<ActionMeta>().create({ isDev: false });

export const router = t.router;

// Runs before input validation, so a missing confirmation is PRECONDITION_FAILED whatever else the input lacks. The
// danger mutations also declare `confirmed: z.literal(true)`, which makes the web client pass it.
const confirmDanger = t.middleware(async ({ meta, getRawInput, next }) => {
  if (meta?.danger) {
    const input = await getRawInput();
    if (!(typeof input === 'object' && input !== null && 'confirmed' in input && input.confirmed === true))
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Hold to confirm this action' });
  }
  return next();
});

/** Anyone, even an unpaired device. Only `pairing.redeem` uses it. */
export const publicProcedure = t.procedure.use(confirmDanger);

/** The PC or a paired device. */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (ctx.client.kind === 'anonymous') throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Pair this device first' });
  return next();
});

/** The PC only: device administration and pairing codes. A paired phone cannot pair or revoke other phones. */
export const loopbackProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.client.kind !== 'loopback') throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the PC can do this' });
  return next();
});
