import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ollamaChat, ollamaSystemOne, ollamaSystemOneUrl, OllamaError } from './ollama.ts';

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

void test('System One sends all three question types and parses structured answers', async () => {
  const controller = new AbortController();
  const input: Parameters<typeof ollamaSystemOne>[1] = {
    model: 'decision-test',
    state: { request: 'test' },
    signal: controller.signal,
    questions: {
      risk: { type: 'choice', instructions: 'Risk', criteria: { low: null, high: 'Destructive' } },
      ready: { type: 'noul', instructions: 'Ready?', criteria: { false: 'No', true: 'Yes' } },
      quality: { type: 'score', instructions: 'Quality', criteria: ['Poor', 'Good', 'Excellent'] },
    },
  };
  const expected = {
    model: input.model,
    answers: {
      risk: { type: 'choice', choice: 'low', probabilities: { low: 0.9, high: 0.1 }, confidence: 0.5 },
      ready: { type: 'noul', noul: 0.8 },
      quality: {
        type: 'score',
        score: 1.3,
        legend: { 0: 'Poor', 1: 'Good', 2: 'Excellent' },
        probabilities: { 0: 0.1, 1: 0.5, 2: 0.4 },
        confidence: 0.2,
      },
    },
    usage: { input_tokens: 20, output_tokens: 3 },
  };
  const result = await ollamaSystemOne(async (url, init) => {
    assert.equal(url, ollamaSystemOneUrl);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init.headers, { 'content-type': 'application/json' });
    assert.equal(init.signal, controller.signal);
    assert.deepEqual(JSON.parse(typeof init.body === 'string' ? init.body : '{}'), {
      model: input.model,
      state: input.state,
      questions: input.questions,
    });
    return Response.json(expected);
  }, input);
  assert.deepEqual(result, expected);
  assert.equal(result.answers.ready?.type, 'noul');
});

void test('System One hides transport, JSON, schema and mismatched-answer failures', async () => {
  const input: Parameters<typeof ollamaSystemOne>[1] = {
    model: 'decision-test',
    state: 'test',
    questions: { risk: { type: 'choice', instructions: 'Risk', criteria: { low: null, high: null } } },
  };
  const answer = { type: 'choice', choice: 'low', probabilities: { low: 1, high: 0 }, confidence: 1 };
  const envelope = { model: input.model, usage: { input_tokens: 1, output_tokens: 1 } };
  const invalid = [
    { ...envelope, answers: {} },
    { ...envelope, answers: { other: answer } },
    { ...envelope, answers: { risk: answer, extra: answer } },
    { ...envelope, answers: { risk: { ...answer, choice: 'private response' } } },
    { ...envelope, answers: { risk: { ...answer, confidence: 2 } } },
    { ...envelope, answers: { risk: { ...answer, probabilities: { low: -1 } } } },
    { ...envelope, answers: { risk: { ...answer, extra: 'private response' } } },
    { ...envelope, answers: { risk: { type: 'noul', noul: 1 } } },
    { answers: { risk: answer } },
  ];
  const failures: (typeof fetch)[] = [
    async () => new Response('private provider response', { status: 500 }),
    async () => {
      throw new Error('private network error');
    },
    async () => new Response('private invalid JSON'),
    ...invalid.map((value) => async () => Response.json(value)),
  ];
  for (const fetcher of failures) {
    await assert.rejects(ollamaSystemOne(fetcher, input), (error: unknown) => {
      assert.ok(error instanceof OllamaError);
      assert.equal(error.message, 'Ollama request failed');
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

void test('System One score levels stay between two and ten and returned scores fit the scale', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({
      model: 'test',
      usage: { input_tokens: 1, output_tokens: 1 },
      answers: {
        score: {
          type: 'score',
          score: 2,
          legend: { 0: 'Bad', 1: 'Good' },
          probabilities: { 0: 0, 1: 1 },
          confidence: 1,
        },
      },
    });
  };
  for (const criteria of [['Only one'], Array.from({ length: 11 }, () => 'Level')]) {
    await assert.rejects(
      ollamaSystemOne(fetcher, {
        model: 'test',
        state: 'test',
        questions: {
          score: { type: 'score', instructions: 'Score', criteria },
        },
      }),
      OllamaError,
    );
  }
  assert.equal(calls, 0);
  await assert.rejects(
    ollamaSystemOne(fetcher, {
      model: 'test',
      state: 'test',
      questions: {
        score: { type: 'score', instructions: 'Score', criteria: ['Bad', 'Good'] },
      },
    }),
    OllamaError,
  );
  assert.equal(calls, 1);
});
