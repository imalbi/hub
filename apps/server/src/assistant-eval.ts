import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { buildServer } from './server.ts';
import { createFakeDesktop } from './testing/fake-desktop.ts';
import { assistantPrompt } from './core/assistant-prompt.ts';
import { deniedPrefixes } from './core/assistant.ts';
import { ollamaChat } from './core/ollama.ts';
import { assistantCases, type AssistantCase } from './assistant-cases.ts';

const action = z.object({
  path: z.string(),
  kind: z.string(),
  label: z.string(),
  description: z.string(),
  schema: z.object({}).loose().nullable(),
});
type Call = { function: { name: string; arguments: Record<string, unknown> } };

export function matches(test: AssistantCase, calls: Call[]) {
  return (
    calls.length === test.calls.length &&
    test.calls.every((expected, index) => {
      const actual = calls[index]?.function;
      if (!actual || !expected.paths.some((path) => path.replaceAll('.', '_') === actual.name)) return false;
      if (expected.without && expected.without in actual.arguments) return false;
      return Object.entries(expected.args ?? {}).every(([key, wanted]) => {
        const got = actual.arguments[key];
        if (typeof wanted === 'object')
          return (
            typeof got === 'string' &&
            ('contains' in wanted ? got.toLowerCase().includes(wanted.contains) : got.startsWith(wanted.starts))
          );
        return got === wanted || (key === 'value' && wanted === 40 && got === 0.4);
      });
    })
  );
}

async function main() {
  process.env.NODE_ENV = 'test';
  const promptIndex = process.argv.indexOf('--prompt');
  const repeatIndex = process.argv.indexOf('--repeat');
  const repeat = repeatIndex < 0 ? 1 : Number(process.argv[repeatIndex + 1]);
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('Invalid --repeat');
  const candidatePath = promptIndex < 0 ? undefined : process.argv[promptIndex + 1];
  if (promptIndex >= 0 && !candidatePath) throw new Error('Missing --prompt file');
  const candidate = candidatePath ? await readFile(candidatePath, 'utf8') : undefined;
  const app = buildServer({ dbPath: ':memory:', deps: { run: createFakeDesktop() } });
  let actions;
  try {
    const result = await app.inject('/trpc/registry.list');
    const envelope = z.object({ result: z.object({ data: z.array(action) }) }).parse(result.json());
    actions = envelope.result.data.filter(
      (item) => item.kind === 'mutation' && !deniedPrefixes.includes(item.path.split('.')[0] ?? ''),
    );
  } finally {
    await app.close();
  }
  for (const [path, label, properties] of [
    ['hue.setPower', 'Accendi o spegni la luce', { on: { type: 'boolean' } }],
    ['hue.setBrightness', 'Imposta luminosità', { percent: { type: 'number' } }],
    ['lavoro.raccogli', 'Cerca nuovi annunci di lavoro', {}],
  ] as const)
    actions.push({ path, kind: 'mutation', label, description: label, schema: { type: 'object', properties } });
  const tools = actions.map((item) => ({
    type: 'function',
    function: {
      name: item.path.replaceAll('.', '_'),
      description: `${item.label}. ${item.description}`,
      parameters: item.schema ?? { type: 'object' },
    },
  }));
  const offered = new Set(tools.map((tool) => tool.function.name));
  const date = new Date(2026, 10, 16, 12);
  const original = assistantPrompt(date);
  const score = async (prompt: string) => {
    const results: boolean[] = [];
    let refused = 0;
    for (const test of assistantCases) {
      let right = true;
      for (let n = 0; n < repeat; n++) {
        const result = await ollamaChat(fetch, {
          model: 'gemma4:12b-it-qat',
          numCtx: 16384,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: test.sentence },
          ],
          tools,
        });
        if (result.promptEvalCount === undefined || result.promptEvalCount >= 16384 - 512) right = false;
        refused += result.calls.filter((item) => !offered.has(item.function.name)).length;
        right = matches(test, result.calls) && right;
      }
      results.push(right);
    }
    return { results, refused };
  };
  const current = await score(original);
  console.log(
    `Current: ${current.results.filter(Boolean).length}/${assistantCases.length}; refused unknown calls: ${current.refused}`,
  );
  let failed = current.results.filter(Boolean).length < 19;
  if (candidate !== undefined) {
    const next = await score(candidate);
    console.log(
      `Candidate: ${next.results.filter(Boolean).length}/${assistantCases.length}; refused unknown calls: ${next.refused}`,
    );
    for (const [index, test] of assistantCases.entries())
      if (current.results[index] !== next.results[index])
        console.log(`${current.results[index] ? 'regression' : 'improvement'}: ${test.sentence}`);
    failed ||=
      next.results.filter(Boolean).length < 19 || current.results.some((right, index) => right && !next.results[index]);
  }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href)
  main().catch(() => {
    console.error('Assistant evaluation failed: model unavailable or invalid response');
    process.exitCode = 1;
  });
