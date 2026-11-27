import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { buildServer } from '../server.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { configSchema } from './config.ts';
import type { createConfirmations } from './confirmations.ts';
import { createLlmGate } from './llm-gate.ts';
import { ollamaSystemOneUrl, ollamaUrl } from './ollama.ts';

process.env.NODE_ENV = 'test';

function decisionResponse(risk: string) {
  return Response.json({
    model: 'decision-test',
    answers: {
      risk: { type: 'choice', choice: risk, probabilities: { low: 0.1, medium: 0.1, high: 0.8 }, confidence: 0.5 },
    },
    usage: { input_tokens: 30, output_tokens: 1 },
  });
}

function chatResponse(names: string[]) {
  return Response.json({
    prompt_eval_count: 100,
    message: { content: '', tool_calls: names.map((name) => ({ function: { name, arguments: { confirmed: true } } })) },
  });
}

void test('Sentinel can tighten confirmations and never relax danger metadata', async (t) => {
  for (const risk of ['', 'low', 'medium', 'high']) {
    for (const danger of [false, true]) {
      await t.test(`${risk || 'disabled'} ${danger ? 'danger' : 'safe'}`, async () => {
        const commands: string[][] = [];
        const urls: unknown[] = [];
        const desktop = createFakeDesktop();
        let confirmations: ReturnType<typeof createConfirmations> | undefined;
        const app = buildServer({
          dbPath: ':memory:',
          config: configSchema.parse({ assistant: { enabled: true, decisionModel: risk ? 'decision-test' : '' } }),
          deps: {
            run: async (bin, args, options) => {
              commands.push([bin, ...args]);
              return desktop(bin, args, options);
            },
            onConfirmations: (value) => {
              confirmations = value;
            },
            fetch: async (url, init) => {
              urls.push(url);
              if (url === ollamaUrl) return chatResponse([danger ? 'system_powerOff' : 'audio_toggleMicMute']);
              assert.equal(url, ollamaSystemOneUrl);
              const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
              assert.equal(body.model, 'decision-test');
              assert.equal(body.state.request, 'test action');
              assert.equal(body.state.actions.length, 1);
              assert.equal(body.state.actions[0].path, danger ? 'system.powerOff' : 'audio.toggleMicMute');
              assert.equal(typeof body.state.actions[0].label, 'string');
              assert.deepEqual(Object.keys(body.questions.risk.criteria), ['low', 'medium', 'high']);
              assert.ok(init?.signal);
              return decisionResponse(risk);
            },
          },
        });
        assert.ok(confirmations);
        let pending: { id: string; input: unknown }[] = [];
        const unsubscribe = confirmations.subscribe((items) => {
          pending = items;
        });
        const targetCalls = () =>
          commands.filter((call) => (danger ? call[1] === 'poweroff' : call[0] === 'wpctl' && call[1] === 'set-mute'))
            .length;
        try {
          const res = await app.inject({
            method: 'POST',
            url: '/trpc/assistant.ask',
            payload: { text: 'test action' },
          });
          assert.equal(res.statusCode, 200);
          const needsConfirmation = danger || risk === 'high';
          assert.equal(res.json().result.data.steps[0].status, needsConfirmation ? 'awaiting confirmation' : 'done');
          assert.equal(targetCalls(), needsConfirmation ? 0 : 1);
          assert.equal(urls.filter((url) => url === ollamaSystemOneUrl).length, risk ? 1 : 0);
          if (needsConfirmation) {
            assert.deepEqual(pending[0]?.input, danger ? {} : undefined);
            assert.ok(pending[0]);
            await confirmations.confirm(pending[0].id, { kind: 'loopback' });
            assert.equal(targetCalls(), 1);
          }
        } finally {
          unsubscribe();
          await app.close();
        }
      });
    }
  }
});

void test('Sentinel only sees offered actions within the three-call limit and high risk covers every match', async () => {
  let decisions = 0;
  let state: unknown;
  const commands: string[][] = [];
  const desktop = createFakeDesktop();
  let confirmations: ReturnType<typeof createConfirmations> | undefined;
  const app = buildServer({
    dbPath: ':memory:',
    config: configSchema.parse({ assistant: { enabled: true, decisionModel: 'decision-test' } }),
    deps: {
      run: async (bin, args, options) => {
        commands.push([bin, ...args]);
        return desktop(bin, args, options);
      },
      onConfirmations: (value) => {
        confirmations = value;
      },
      fetch: async (url, init) => {
        if (url === ollamaUrl)
          return chatResponse([
            'settings_save',
            'audio_toggleMicMute',
            'audio_toggleMicMute',
            'system_powerOff',
            'assistant_warm',
          ]);
        decisions++;
        state = JSON.parse(typeof init?.body === 'string' ? init.body : '{}').state;
        return decisionResponse('high');
      },
    },
  });
  assert.ok(confirmations);
  let pending: { id: string }[] = [];
  const unsubscribe = confirmations.subscribe((items) => {
    pending = items;
  });
  try {
    const res = await app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'test' } });
    assert.deepEqual(
      res.json().result.data.steps.map((step: { status: string }) => step.status),
      ['refused', 'awaiting confirmation', 'awaiting confirmation', 'refused', 'refused'],
    );
    assert.equal(decisions, 1);
    assert.equal(JSON.stringify(state).includes('settings'), false);
    assert.equal(JSON.stringify(state).includes('system.powerOff'), false);
    assert.equal(JSON.stringify(state).includes('assistant.warm'), false);
    assert.equal(commands.filter((call) => call[1] === 'set-mute' || call[1] === 'poweroff').length, 0);
    assert.equal(pending.length, 2);
    for (const item of pending) await confirmations.confirm(item.id, { kind: 'loopback' });
    assert.equal(commands.filter((call) => call[1] === 'set-mute').length, 2);
  } finally {
    unsubscribe();
    await app.close();
  }
});

void test('Sentinel skips turns with no offered actions or a full context', async () => {
  for (const calls of [[], ['settings_save', 'assistant_warm'], ['audio_toggleMicMute']]) {
    let requests = 0;
    const app = buildServer({
      dbPath: ':memory:',
      config: configSchema.parse({ assistant: { enabled: true, decisionModel: 'decision-test' } }),
      deps: {
        run: createFakeDesktop(),
        fetch: async (url) => {
          requests++;
          assert.equal(url, ollamaUrl);
          if (calls[0] === 'audio_toggleMicMute')
            return Response.json({
              prompt_eval_count: 16384,
              message: { tool_calls: [{ function: { name: calls[0], arguments: {} } }] },
            });
          return chatResponse(calls);
        },
      },
    });
    try {
      assert.equal(
        (await app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'test' } })).statusCode,
        200,
      );
      assert.equal(requests, 1);
    } finally {
      await app.close();
    }
  }
});

void test('Sentinel failures warn without provider data and preserve safe and danger behavior', async (t) => {
  for (const failure of ['http', 'json', 'shape', 'choice', 'network', 'timeout']) {
    await t.test(failure, async (t) => {
      if (failure === 'timeout') t.mock.timers.enable({ apis: ['setTimeout'] });
      const desktop = createFakeDesktop();
      const commands: string[][] = [];
      let confirmations: ReturnType<typeof createConfirmations> | undefined;
      const app = buildServer({
        dbPath: ':memory:',
        config: configSchema.parse({ assistant: { enabled: true, decisionModel: 'decision-test' } }),
        deps: {
          run: async (bin, args, options) => {
            commands.push([bin, ...args]);
            return desktop(bin, args, options);
          },
          onConfirmations: (value) => {
            confirmations = value;
          },
          fetch: async (url, init) => {
            if (url === ollamaUrl) return chatResponse(['audio_toggleMicMute', 'system_powerOff']);
            switch (failure) {
              case 'http':
                return new Response('private provider data', { status: 500 });
              case 'json':
                return new Response('private invalid JSON');
              case 'shape':
                return Response.json({ answers: { risk: 'high' }, error: 'private data' });
              case 'choice':
                return decisionResponse('invalid');
              case 'network':
                throw new Error('private connection data');
              default:
                return new Promise<Response>((_resolve, reject) => {
                  assert.ok(init?.signal);
                  init.signal.addEventListener('abort', () => reject(new Error('private timeout data')), {
                    once: true,
                  });
                  t.mock.timers.tick(30_000);
                });
            }
          },
        },
      });
      const warnings: unknown[][] = [];
      t.mock.method(app.log, 'warn', (...args: unknown[]) => {
        warnings.push(args);
      });
      assert.ok(confirmations);
      const unsubscribe = confirmations.subscribe(() => undefined);
      try {
        const res = await app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'test' } });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(
          res.json().result.data.steps.map((step: { status: string }) => step.status),
          ['done', 'awaiting confirmation'],
        );
        assert.equal(commands.filter((call) => call[1] === 'set-mute').length, 1);
        assert.equal(
          commands.some((call) => call[1] === 'poweroff'),
          false,
        );
        assert.equal(warnings.length, 1);
        assert.deepEqual(warnings[0]?.[0], { event: 'assistant.sentinel.failed' });
        assert.equal(JSON.stringify(warnings).includes('private'), false);
      } finally {
        unsubscribe();
        await app.close();
      }
    });
  }
});

void test('Sentinel runs through the shared queue with front priority and without spending its cap', async () => {
  const llmGate = createLlmGate();
  const order: string[] = [];
  const waiting: Promise<void>[] = [];
  const used = llmGate.used();
  const app = buildServer({
    dbPath: ':memory:',
    config: configSchema.parse({ assistant: { enabled: true, decisionModel: 'decision-test' } }),
    deps: {
      llmGate,
      run: createFakeDesktop(),
      fetch: async (url, init) => {
        if (url === ollamaUrl) {
          order.push('chat');
          for (const name of ['background-one', 'background-two'])
            waiting.push(
              llmGate(
                0,
                async () => {
                  order.push(name);
                },
                { counted: false },
              ),
            );
          return chatResponse(['settings_save', 'assistant_warm', 'audio_toggleMicMute']);
        }
        order.push('sentinel');
        const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
        assert.deepEqual(
          body.state.actions.map((action: { path: string }) => action.path),
          ['audio.toggleMicMute'],
        );
        return decisionResponse('low');
      },
    },
  });
  try {
    const response = await app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'test' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().result.data.steps.map((step: { status: string }) => step.status),
      ['refused', 'refused', 'done'],
    );
    await Promise.all(waiting);
    assert.deepEqual(order, ['chat', 'sentinel', 'background-one', 'background-two']);
    assert.equal(llmGate.used(), used);
  } finally {
    await app.close();
  }
});

void test('warm remains nonblocking with a decision model and logs a failed chat load', async (t) => {
  const urls: unknown[] = [];
  let rejectLoad: ((error: Error) => void) | undefined;
  const app = buildServer({
    dbPath: ':memory:',
    config: configSchema.parse({ assistant: { enabled: true, decisionModel: 'decision-test' } }),
    deps: {
      run: createFakeDesktop(),
      fetch: async (url) => {
        urls.push(url);
        return new Promise<Response>((_resolve, reject) => {
          rejectLoad = reject;
        });
      },
    },
  });
  const warnings: unknown[][] = [];
  t.mock.method(app.log, 'warn', (...args: unknown[]) => {
    warnings.push(args);
  });
  try {
    const res = await app.inject({ method: 'POST', url: '/trpc/assistant.warm', payload: {} });
    assert.deepEqual(res.json().result.data, { loading: true });
    assert.deepEqual(urls, [ollamaUrl]);
    assert.ok(rejectLoad);
    rejectLoad(new Error('private provider data'));
    await setImmediate();
    assert.deepEqual(warnings[0]?.[0], { event: 'assistant.warm.failed' });
    assert.equal(JSON.stringify(warnings).includes('private'), false);
  } finally {
    await app.close();
  }
});
