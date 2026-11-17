import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ollamaChat, OllamaError } from './ollama.ts';

void test('sends the context and tools and reads a non-streaming answer', async () => {
  let body: unknown;
  const fetcher: typeof fetch = async (_url, init) => {
    const requestBody = init?.body;
    assert.equal(typeof requestBody, 'string');
    if (typeof requestBody !== 'string') throw new Error('Expected JSON body');
    body = JSON.parse(requestBody);
    return Response.json({
      message: { content: 'ok', tool_calls: [{ function: { name: 'a', arguments: {} } }] },
      prompt_eval_count: 42,
    });
  };
  const tools = [{ type: 'function', function: { name: 'a', description: 'A', parameters: { type: 'object' } } }];
  const answer = await ollamaChat(fetcher, {
    model: 'test',
    messages: [{ role: 'user', content: 'hello' }],
    tools,
    numCtx: 2048,
  });
  assert.deepEqual(body, {
    model: 'test',
    messages: [{ role: 'user', content: 'hello' }],
    tools,
    stream: false,
    think: false,
    options: { num_ctx: 2048, temperature: 0 },
  });
  assert.equal(answer.text, 'ok');
  assert.equal(answer.calls[0]?.function.name, 'a');
  assert.equal(answer.promptEvalCount, 42);
});

void test('provider errors never expose the provider response', async () => {
  for (const fetcher of [
    async () => new Response('private provider text', { status: 500 }),
    async () => {
      throw new Error('private connection text');
    },
  ]) {
    await assert.rejects(
      ollamaChat(fetcher, { model: 'test', messages: [], numCtx: 1000 }),
      (error: unknown) => error instanceof OllamaError && !error.message.includes('private'),
    );
  }
});
