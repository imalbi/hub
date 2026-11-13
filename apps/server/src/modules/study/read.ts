import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import { z } from '../../core/module.ts';
import { effectiveMix, orderDays } from './order.ts';
import { planShape } from './plan.ts';
import { days, plans, preferences, progress } from './schema.ts';

const dayShape = planShape.shape.days.element;
const mixShape = z.record(z.string(), z.number());

export function readIndex(db: Db) {
  const plan = db.select().from(plans).where(eq(plans.active, true)).get();
  if (!plan) return null;
  const settings = db.select().from(preferences).where(eq(preferences.planId, plan.id)).get();
  const entries = db
    .select({
      id: days.id,
      position: days.position,
      subject: sql<string>`json_extract(${days.data}, '$.subject')`,
      title: sql<string>`json_extract(${days.data}, '$.title')`,
      phase: sql<string | null>`json_extract(${days.data}, '$.phase')`,
      kind: sql<'study' | 'mock' | 'review'>`json_extract(${days.data}, '$.kind')`,
      minutes: sql<number | null>`json_extract(${days.data}, '$.minutes')`,
    })
    .from(days)
    .where(eq(days.planId, plan.id))
    .orderBy(days.position)
    .all();
  const records = db.select().from(progress).where(eq(progress.planId, plan.id)).all();
  const states = Object.fromEntries(
    records.filter((item) => item.kind === 'subject').map((item) => [item.id, item.value]),
  );
  const done = new Set(records.filter((item) => item.kind === 'day' && item.value === 'done').map((item) => item.id));
  const mix = settings?.mix ? effectiveMix(mixShape.parse(JSON.parse(settings.mix)), states) : null;
  const ordered = orderDays(
    entries.map((day) => ({ ...day, minutes: day.minutes ?? undefined, done: done.has(day.id) })),
    states,
    mix,
  );
  const shown = new Set(ordered.map((day) => day.id));
  const hiddenDays = entries
    .filter((day) => !shown.has(day.id))
    .map((day) => ({ ...day, minutes: day.minutes ?? undefined, done: done.has(day.id), g: null }));
  return {
    planId: plan.id,
    states,
    mix,
    weeklyHours:
      settings?.weeklyHours === null || settings?.weeklyHours === undefined ? null : settings.weeklyHours / 60,
    days: ordered.map((day, index) => ({ ...day, g: index + 1 })),
    hiddenDays,
  };
}

export function readDays(db: Db, offset: number, limit: number) {
  const index = readIndex(db);
  if (!index) return [];
  const selected = index.days.slice(offset, offset + limit);
  return readSelected(db, index.planId, selected);
}

export function readDaysById(db: Db, ids: string[]) {
  const index = readIndex(db);
  if (!index) return [];
  const requested = new Set(ids);
  return readSelected(
    db,
    index.planId,
    [...index.days, ...index.hiddenDays].filter((day) => requested.has(day.id)),
  );
}

function readSelected(
  db: Db,
  planId: string,
  selected: Array<
    | NonNullable<ReturnType<typeof readIndex>>['days'][number]
    | NonNullable<ReturnType<typeof readIndex>>['hiddenDays'][number]
  >,
) {
  if (!selected.length) return [];
  const rows = db
    .select()
    .from(days)
    .where(
      and(
        eq(days.planId, planId),
        inArray(
          days.id,
          selected.map((day) => day.id),
        ),
      ),
    )
    .all();
  const byId = new Map(rows.map((row) => [row.id, dayShape.parse(JSON.parse(row.data))]));
  return selected.flatMap((item) => {
    const day = byId.get(item.id);
    return day ? [{ ...day, g: item.g, done: item.done }] : [];
  });
}
