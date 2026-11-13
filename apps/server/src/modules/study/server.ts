import { watch, type FSWatcher } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { defineModule, TRPCError, z } from '../../core/module.ts';
import { createLiveHub } from '../../core/live.ts';
import { protectedProcedure, router } from '../../core/trpc.ts';
import { listInbox, readPlan } from './inbox.ts';
import { planShape } from './plan.ts';
import { activeHeaders, GLOBAL, readDays, readDaysById, readIndex, subjectKey } from './read.ts';
import { plans, preferences, progress } from './schema.ts';
import { savePlan } from './store.ts';

export const studyModule = defineModule({
  name: 'study',
  migrations: fileURLToPath(new URL('./drizzle', import.meta.url)),
  config: z
    .object({
      plansDir: z
        .string()
        .default('')
        .meta({ title: 'Cartella piani', description: 'Cartella dei piani; lascia vuoto per disattivare la ricerca.' }),
      materialDirs: z
        .array(z.string())
        .default([])
        .meta({ title: 'Cartelle materiali', description: 'Cartelle dei materiali di studio.' }),
    })
    .default({ plansDir: '', materialDirs: [] }),
  create({ db, config, log }) {
    const inboxDir = join(config.plansDir, 'in-arrivo');
    const archiveDir = join(config.plansDir, 'archivio');
    let watcher: FSWatcher | undefined;
    let closed = false;
    let activating = false;
    const ready = config.plansDir
      ? mkdir(inboxDir, { recursive: true })
          .then(() => {
            if (!closed) watcher = watch(inboxDir, { recursive: true }, () => void live.notify());
            watcher?.on('error', () => log.warn('Study inbox watcher failed'));
          })
          .catch(() => log.warn('Study inbox is unavailable'))
      : Promise.resolve();
    async function inbox() {
      if (!config.plansDir) return [];
      await ready;
      try {
        return await listInbox(inboxDir);
      } catch {
        return [];
      }
    }
    const live = createLiveHub(inbox, null);
    return {
      router: router({
        inbox: protectedProcedure.query(inbox),
        onInbox: protectedProcedure.subscription(({ signal }) => live.subscribe(signal)),
        active: protectedProcedure.query(() => activeHeaders(db)),
        paused: protectedProcedure.query(() =>
          db
            .select()
            .from(plans)
            .where(eq(plans.active, false))
            .orderBy(plans.id)
            .all()
            .map((row) => {
              const header = planShape.omit({ days: true }).parse(JSON.parse(row.header));
              return { id: header.id, title: header.title, version: header.version };
            }),
        ),
        index: protectedProcedure.query(() => readIndex(db)),
        days: protectedProcedure
          .input(z.object({ offset: z.int().min(0), limit: z.int().min(1).max(100) }))
          .query(({ input }) => readDays(db, input.offset, input.limit)),
        daysById: protectedProcedure
          .input(z.object({ keys: z.array(z.string()).max(100) }))
          .query(({ input }) => readDaysById(db, input.keys)),
        setPlan: protectedProcedure
          .meta({ label: 'Stato piano', description: 'Pause or resume a study plan; paused plans keep their progress' })
          .input(z.object({ id: z.string(), active: z.boolean() }))
          .mutation(({ input }) => {
            const row = db.select().from(plans).where(eq(plans.id, input.id)).get();
            if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
            db.update(plans).set({ active: input.active }).where(eq(plans.id, input.id)).run();
          }),
        setSubject: protectedProcedure
          .meta({ label: 'Stato materia', description: 'Pause or resume a study subject' })
          .input(z.object({ plan: z.string(), id: z.string(), state: z.enum(['active', 'paused']) }))
          .mutation(({ input }) => {
            const header = activeHeaders(db).find((item) => item.id === input.plan);
            if (!header?.subjects.some((subject) => subject.id === input.id))
              throw new TRPCError({ code: 'BAD_REQUEST' });
            db.insert(progress)
              .values({ planId: header.id, kind: 'subject', id: input.id, value: input.state })
              .onConflictDoUpdate({
                target: [progress.planId, progress.kind, progress.id],
                set: { value: input.state },
              })
              .run();
          }),
        setMix: protectedProcedure
          .meta({
            label: 'Mix di studio',
            description: 'Set weekly hours and the share of each subject of the active study plans',
          })
          .input(
            z.object({ hours: z.number().positive().max(168), mix: z.record(z.string(), z.number().min(0).max(100)) }),
          )
          .mutation(({ input }) => {
            const headers = activeHeaders(db);
            if (!headers.length) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
            const keys = new Set(
              headers.flatMap((header) => header.subjects.map((subject) => subjectKey(header.id, subject.id))),
            );
            const entries = Object.entries(input.mix);
            const states = readIndex(db)?.states ?? {};
            if (
              entries.length !== keys.size ||
              entries.some(([key]) => !keys.has(key)) ||
              entries.some(([key, share]) => (states[key] === 'paused' || states[key] === 'passed') && share !== 0) ||
              Math.abs(entries.reduce((sum, [, share]) => sum + share, 0) - 100) > 0.000001
            )
              throw new TRPCError({ code: 'BAD_REQUEST' });
            const weeklyHours = Math.round(input.hours * 60);
            db.insert(preferences)
              .values({ planId: GLOBAL, weeklyHours, mix: JSON.stringify(input.mix) })
              .onConflictDoUpdate({ target: preferences.planId, set: { weeklyHours, mix: JSON.stringify(input.mix) } })
              .run();
          }),
        activate: protectedProcedure
          .meta({ label: 'Attiva piano', description: 'Activate a valid study plan from the inbox' })
          .input(
            z.object({
              name: z
                .string()
                .min(1)
                .regex(/^[^/\\]+$/)
                .refine((name) => name !== '.' && name !== '..'),
            }),
          )
          .mutation(async ({ input }) => {
            if (!config.plansDir) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
            if (activating) throw new TRPCError({ code: 'CONFLICT' });
            activating = true;
            try {
              await ready;
              const source = join(inboxDir, input.name);
              let plan;
              try {
                plan = await readPlan(source);
              } catch {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid plan' });
              }
              await mkdir(archiveDir, { recursive: true });
              let target = join(archiveDir, input.name);
              try {
                await lstat(target);
                target = join(archiveDir, `${randomUUID()}-${input.name}`);
              } catch (error) {
                if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
              }
              await rename(source, target);
              try {
                savePlan(db, plan);
              } catch (error) {
                await rename(target, source);
                throw error;
              }
              void live.notify();
            } finally {
              activating = false;
            }
          }),
      }),
      close: async () => {
        closed = true;
        await ready;
        watcher?.close();
      },
    };
  },
});
