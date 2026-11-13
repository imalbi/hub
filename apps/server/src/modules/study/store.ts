import { eq } from 'drizzle-orm';
import type { Db } from '../../db/index.ts';
import type { StudyPlan } from './plan.ts';
import { days, plans } from './schema.ts';

export function savePlan(db: Db, plan: StudyPlan) {
  const { days: entries, ...header } = plan;
  db.transaction((tx) => {
    tx.update(plans).set({ active: false }).run();
    tx.insert(plans)
      .values({ id: plan.id, version: plan.version, header: JSON.stringify(header), active: true })
      .onConflictDoUpdate({
        target: plans.id,
        set: { version: plan.version, header: JSON.stringify(header), active: true },
      })
      .run();
    tx.delete(days).where(eq(days.planId, plan.id)).run();
    for (const [position, day] of entries.entries()) {
      tx.insert(days)
        .values({ planId: plan.id, id: day.id, position, data: JSON.stringify(day) })
        .run();
    }
  });
}
