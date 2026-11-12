import { sql } from 'drizzle-orm';
import { scanContent } from '../../../../scripts/private-scanner.ts';
import type { Db } from '../db/index.ts';
import { agentCalls } from '../db/schema.ts';

function mask(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (/token|secret|password|api.?key/i.test(key)) return value ? `${value.slice(0, 2)}***` : value;
    return scanContent('audit', `${key}: ${JSON.stringify(value)}`)[0]?.masked ?? value;
  }
  if (Array.isArray(value)) return value.map((item) => mask(item, key));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, mask(child, childKey)]));
  return value;
}

export async function recordAgentCall(
  db: Db,
  call: { agentId: number | null; name: string; action: string; input: unknown; result: unknown; durationMs: number },
) {
  await db.insert(agentCalls).values({
    ...call,
    input: JSON.stringify(mask(call.input)) ?? 'null',
    result: JSON.stringify(mask(call.result)) ?? 'null',
    createdAt: new Date(),
  });
  db.run(sql`delete from agent_calls where id not in (select id from agent_calls order by id desc limit 500)`);
}
