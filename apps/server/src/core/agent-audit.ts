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

const RESULT_CAP = 2048;

// A result can carry mail or application text: keep a short masked head and the full length, never the whole thing.
function shortResult(result: unknown) {
  const json = JSON.stringify(mask(result)) ?? 'null';
  return json.length > RESULT_CAP ? `${json.slice(0, RESULT_CAP)} …[truncated, ${json.length} chars]` : json;
}

export async function recordAgentCall(
  db: Db,
  call: { agentId: number | null; name: string; action: string; input: unknown; result: unknown; durationMs: number },
) {
  await db.insert(agentCalls).values({
    ...call,
    input: JSON.stringify(mask(call.input)) ?? 'null',
    result: shortResult(call.result),
    createdAt: new Date(),
  });
  db.run(sql`delete from agent_calls where id not in (select id from agent_calls order by id desc limit 500)`);
}
