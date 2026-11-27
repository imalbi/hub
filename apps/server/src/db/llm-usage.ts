import { eq, sql } from 'drizzle-orm';
import type { Db } from './index.ts';
import { llmUsage } from './schema.ts';
import type { LlmUsageStore } from '../core/llm-gate.ts';

export function createLlmUsageStore(db: Db): LlmUsageStore {
  return {
    read(day) {
      return db.select({ count: llmUsage.count }).from(llmUsage).where(eq(llmUsage.day, day)).get()?.count ?? 0;
    },
    increment(day) {
      return db
        .insert(llmUsage)
        .values({ day, count: 1, updatedAt: new Date() })
        .onConflictDoUpdate({ target: llmUsage.day, set: { count: sql`${llmUsage.count} + 1`, updatedAt: new Date() } })
        .returning({ count: llmUsage.count })
        .get().count;
    },
  };
}
