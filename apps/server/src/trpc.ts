import { initTRPC } from '@trpc/server';
import type { Config } from './config.ts';
import type { Db } from './db/index.ts';
import type { Run } from './exec.ts';

/** Registry metadata for an action (a mutation). Later steps derive LLM tools and the danger check from it. */
export type ActionMeta = {
  /** English, written for an LLM: what the action does, not how it is labelled in the UI. */
  description: string;
  danger?: boolean;
};

export type Context = { db: Db; run: Run; config: Config };

const t = initTRPC.context<Context>().meta<ActionMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
