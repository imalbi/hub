import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { deskLayouts } from '../../db/schema.ts';

// The desk zones (`apps/web/src/shell/zones.ts`); each is a board of widgets.
export const builtinZones = ['overview', 'study', 'media', 'system', 'devices'];

// The server knows the shape, not the widgets: those are defined by the web app (and later by modules), which drops ids
// it does not know. Positions are grid units on 12 columns.
export const layoutItemsSchema = z
  .array(
    z.object({
      widget: z.string().regex(/^[a-z][a-z\d-]{0,39}$/),
      size: z.enum(['small', 'medium', 'large', 'wide', 'full']),
      x: z.number().int().min(0).max(11),
      y: z.number().int().min(0).max(200),
    }),
  )
  .max(40);

export function createLayoutRouter(zones: ReadonlySet<string>) {
  const zone = z.string().refine((value) => zones.has(value), 'Unknown desk zone');
  return router({
    /** The saved board of a zone, or null for the default one. */
    get: protectedProcedure.input(z.object({ zone })).query(({ ctx, input }) => {
      const row = ctx.db.select().from(deskLayouts).where(eq(deskLayouts.zone, input.zone)).get();
      const items = layoutItemsSchema.safeParse(row?.items);
      return items.success ? items.data : null;
    }),

    save: protectedProcedure
      .meta({ description: 'Save the arrangement of widgets on a desk zone: which widgets, their size and position' })
      .input(z.object({ zone, items: layoutItemsSchema }))
      .mutation(({ ctx, input }) => {
        ctx.db
          .insert(deskLayouts)
          .values({ zone: input.zone, items: input.items, updatedAt: new Date() })
          .onConflictDoUpdate({ target: deskLayouts.zone, set: { items: input.items, updatedAt: new Date() } })
          .run();
      }),

    reset: protectedProcedure
      .meta({ description: 'Put the widgets of a desk zone back to the default arrangement' })
      .input(z.object({ zone }))
      .mutation(({ ctx, input }) => {
        ctx.db.delete(deskLayouts).where(eq(deskLayouts.zone, input.zone)).run();
      }),
  });
}
