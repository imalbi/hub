import { z } from 'zod';
import type { CatalogService } from './catalog.ts';
import { moduleNameSchema } from './discovery.ts';
import { loopbackProcedure, router } from './trpc.ts';

const sourceIdSchema = z.string().trim().min(1).max(64);

/**
 * Loopback-only catalog administration router. Mounted only on the outer AppRouter (never in `registered`) and
 * marked `pageOnly` so paired devices, MCP agents, and the LLM assistant can neither discover nor invoke it.
 */
export function createCatalogRouter(catalog: CatalogService) {
  return router({
    state: loopbackProcedure.query(() => catalog.state()),
    addSource: loopbackProcedure
      .meta({
        label: 'Aggiungi catalogo',
        description: 'Register a trusted Git module catalog repository',
        pageOnly: true,
      })
      .input(z.object({ url: z.string().trim().min(1).max(2048) }))
      .mutation(({ input }) => catalog.addSource(input)),
    syncSource: loopbackProcedure
      .meta({
        label: 'Aggiorna catalogo',
        description: 'Sync a registered Git module catalog repository',
        pageOnly: true,
      })
      .input(z.object({ id: sourceIdSchema }))
      .mutation(({ input }) => catalog.syncSource(input)),
    removeSource: loopbackProcedure
      .meta({
        label: 'Rimuovi catalogo',
        description: 'Remove a registered Git module catalog repository',
        danger: true,
        pageOnly: true,
      })
      .input(z.object({ id: sourceIdSchema, confirmed: z.literal(true) }))
      .mutation(({ input }) => catalog.removeSource({ id: input.id })),
    install: loopbackProcedure
      .meta({
        label: 'Installa modulo',
        description: 'Install a module from a registered Git catalog repository',
        danger: true,
        pageOnly: true,
      })
      .input(z.object({ sourceId: sourceIdSchema, name: moduleNameSchema, confirmed: z.literal(true) }))
      .mutation(({ input }) => catalog.installModule({ sourceId: input.sourceId, name: input.name })),
    update: loopbackProcedure
      .meta({
        label: 'Aggiorna modulo',
        description: 'Update an installed catalog module from its registered repository',
        danger: true,
        pageOnly: true,
      })
      .input(z.object({ name: moduleNameSchema, confirmed: z.literal(true) }))
      .mutation(({ input }) => catalog.updateModule({ name: input.name })),
    remove: loopbackProcedure
      .meta({
        label: 'Rimuovi modulo',
        description: 'Remove an installed catalog module while preserving its SQLite database',
        danger: true,
        pageOnly: true,
      })
      .input(z.object({ name: moduleNameSchema, confirmed: z.literal(true) }))
      .mutation(({ input }) => catalog.removeModule({ name: input.name })),
    applyChanges: loopbackProcedure
      .meta({
        label: 'Ricostruisci e riavvia',
        description: 'Rebuild the web app and restart Hub to apply catalog changes',
        pageOnly: true,
      })
      .mutation(() => catalog.apply()),
  });
}
