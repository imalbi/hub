import type { CaelestiaTheme } from './caelestia.ts';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createLiveHub } from '../../core/live.ts';
import { protectedProcedure, router } from '../../core/trpc.ts';
import type { Db } from '../../db/index.ts';
import { themes } from '../../db/schema.ts';
import { themeValuesSchema } from './values.ts';

const name = z.string().trim().min(1).max(40);
const id = z.number().int().positive();

export function readCustomThemes(db: Db) {
  // A row that no longer validates (hand-edited database) is skipped rather than reaching the page's CSS.
  return db
    .select()
    .from(themes)
    .orderBy(themes.id)
    .all()
    .flatMap((row) => {
      const values = themeValuesSchema.safeParse(row.values);
      return values.success ? [{ id: row.id, name: row.name, base: row.base, values: values.data }] : [];
    });
}

/** Push-only: the list changes only through the mutations below, which notify it. */
export function createCustomThemesLive(db: Db) {
  return createLiveHub(() => Promise.resolve(readCustomThemes(db)), null);
}

export type CustomThemesLive = ReturnType<typeof createCustomThemesLive>;

export function createThemeRouter(caelestia: CaelestiaTheme, customThemes: CustomThemesLive) {
  return router({
    caelestia: protectedProcedure.query(() => caelestia.read()),
    onCaelestia: protectedProcedure.subscription(({ signal }) => caelestia.subscribe(signal)),

    list: protectedProcedure.query(({ ctx }) => readCustomThemes(ctx.db)),
    onList: protectedProcedure.subscription(({ signal }) => customThemes.subscribe(signal)),

    save: protectedProcedure
      .meta({ description: 'Create a custom color theme, or replace the colors and name of an existing one' })
      .input(z.object({ id: id.optional(), name, base: z.string().min(1).max(40), values: themeValuesSchema }))
      .mutation(({ ctx, input }) => {
        const now = new Date();
        let saved: number;
        if (input.id === undefined) {
          const [row] = ctx.db
            .insert(themes)
            .values({ name: input.name, base: input.base, values: input.values, createdAt: now, updatedAt: now })
            .returning({ id: themes.id })
            .all();
          if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Theme not saved' });
          saved = row.id;
        } else {
          const updated = ctx.db
            .update(themes)
            .set({ name: input.name, values: input.values, updatedAt: now })
            .where(eq(themes.id, input.id))
            .returning({ id: themes.id })
            .all();
          if (updated.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such theme' });
          saved = input.id;
        }
        void customThemes.notify();
        return { id: saved };
      }),

    rename: protectedProcedure
      .meta({ description: 'Rename a custom color theme' })
      .input(z.object({ id, name }))
      .mutation(({ ctx, input }) => {
        const updated = ctx.db
          .update(themes)
          .set({ name: input.name, updatedAt: new Date() })
          .where(eq(themes.id, input.id))
          .returning({ id: themes.id })
          .all();
        if (updated.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such theme' });
        void customThemes.notify();
      }),

    delete: protectedProcedure
      .meta({
        description: 'Delete a custom color theme; devices using it fall back to the default dark theme',
        danger: true,
      })
      .input(z.object({ id, confirmed: z.literal(true) }))
      .mutation(({ ctx, input }) => {
        const removed = ctx.db.delete(themes).where(eq(themes.id, input.id)).returning({ id: themes.id }).all();
        if (removed.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such theme' });
        void customThemes.notify();
      }),
  });
}
