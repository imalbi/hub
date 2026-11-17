import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from '../server.ts';
import { configSchema } from './config.ts';
import { createFakeDesktop } from '../testing/fake-desktop.ts';
import { deniedPrefixes } from './assistant.ts';

process.env.NODE_ENV = 'test';

void test('assistant refuses unknown and setup tools, limits calls and continues after invalid input', async () => {
  let sent: unknown;
  const fetcher: typeof fetch = async (_url, init) => {
    const requestBody = init?.body;
    assert.equal(typeof requestBody, 'string');
    if (typeof requestBody !== 'string') throw new Error('Expected JSON body');
    sent = JSON.parse(requestBody);
    return Response.json({
      prompt_eval_count: 100,
      message: {
        content: '',
        tool_calls: [
          { function: { name: 'settings_save', arguments: {} } },
          { function: { name: 'audio_setVolume', arguments: { value: 300 } } },
          { function: { name: 'audio_toggleMicMute', arguments: {} } },
          { function: { name: 'audio_toggleMicMute', arguments: {} } },
          { function: { name: 'music_playPause', arguments: {} } },
        ],
      },
    });
  };
  const app = buildServer({
    dbPath: ':memory:',
    config: configSchema.parse({ assistant: { enabled: true } }),
    deps: { run: createFakeDesktop(), fetch: fetcher },
  });
  try {
    const res = await app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'do things' } });
    assert.equal(res.statusCode, 200);
    const data = res.json().result.data;
    assert.deepEqual(
      data.steps.map((step: { status: string }) => step.status),
      ['refused', 'failed', 'done', 'refused', 'refused'],
    );
    for (const prefix of deniedPrefixes) assert.equal(JSON.stringify(sent).includes(`"name":"${prefix}_`), false);
    const audit = await app.inject({ method: 'GET', url: '/trpc/agents.localCalls' });
    assert.equal(audit.json().result.data[0].name, 'assistente');
  } finally {
    await app.close();
  }
});

void test('paired devices and agent tokens cannot ask the assistant', async () => {
  let requests = 0;
  const app = buildServer({
    dbPath: ':memory:',
    config: configSchema.parse({ assistant: { enabled: true } }),
    deps: {
      run: createFakeDesktop(),
      fetch: async () => {
        requests++;
        throw new Error();
      },
    },
  });
  try {
    const created = await app.inject({ method: 'POST', url: '/trpc/pairing.createCode', payload: {} });
    const redeemed = await app.inject({
      method: 'POST',
      url: '/trpc/pairing.redeem',
      remoteAddress: '192.0.2.20',
      payload: { code: created.json().result.data.code, deviceName: 'Phone' },
    });
    const agent = await app.inject({ method: 'POST', url: '/trpc/agents.create', payload: { name: 'Test agent' } });
    for (const token of [redeemed.json().result.data.token, agent.json().result.data.token]) {
      const res = await app.inject({
        method: 'POST',
        url: '/trpc/assistant.ask',
        remoteAddress: '192.0.2.20',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: 'metti cuffie' },
      });
      assert.equal(res.json().error.data.code, 'UNAUTHORIZED');
    }
    assert.equal(requests, 0);
  } finally {
    await app.close();
  }
});

void test('disabled assistant does not call the provider', async () => {
  let called = false;
  const app = buildServer({
    dbPath: ':memory:',
    deps: {
      run: createFakeDesktop(),
      fetch: async () => {
        called = true;
        throw new Error();
      },
    },
  });
  try {
    const res = await app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'hello world' } });
    assert.equal(res.statusCode, 412);
    assert.equal(called, false);
  } finally {
    await app.close();
  }
});

void test('a selected audio output runs once and a nearly full context runs nothing', async () => {
  let count = 100;
  const calls: string[][] = [];
  const desktop = createFakeDesktop();
  const app = buildServer({
    dbPath: ':memory:',
    config: configSchema.parse({
      assistant: { enabled: true },
      audio: { outputs: [{ label: 'Cuffie', match: 'USB Headset' }] },
    }),
    deps: {
      run: async (bin, args, options) => {
        calls.push([bin, ...args]);
        return desktop(bin, args, options);
      },
      fetch: async () =>
        Response.json({
          prompt_eval_count: count,
          message: {
            content: '',
            tool_calls: [{ function: { name: 'audio_setOutput', arguments: { label: 'Cuffie' } } }],
          },
        }),
    },
  });
  try {
    const ask = () => app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'metti cuffie' } });
    const first = await ask();
    assert.equal(first.json().result.data.steps[0].status, 'done');
    assert.equal(calls.filter((call) => call[0] === 'wpctl' && call[1] === 'set-default').length, 1);
    count = 16384 - 100;
    const before = calls.length;
    const second = await ask();
    assert.equal(second.json().result.data.text, 'Troppe azioni per il modello: alza il contesto in Impostazioni');
    assert.equal(calls.length, before);
  } finally {
    await app.close();
  }
});

void test('model confirmation cannot power off until the human confirms', async () => {
  const commands: string[][] = [];
  const desktop = createFakeDesktop();
  const { createConfirmations } = await import('./confirmations.ts');
  let confirmations: ReturnType<typeof createConfirmations> | undefined;
  const app = buildServer({
    dbPath: ':memory:',
    config: configSchema.parse({ assistant: { enabled: true } }),
    deps: {
      onConfirmations: (value) => {
        confirmations = value;
      },
      run: async (bin, args, options) => {
        commands.push([bin, ...args]);
        return desktop(bin, args, options);
      },
      fetch: async () =>
        Response.json({
          prompt_eval_count: 100,
          message: {
            content: '',
            tool_calls: [{ function: { name: 'system_powerOff', arguments: { confirmed: true } } }],
          },
        }),
    },
  });
  let pending: { id: string; input: unknown }[] = [];
  assert.ok(confirmations);
  const unsubscribe = confirmations.subscribe((items) => {
    pending = items;
  });
  try {
    const res = await app.inject({ method: 'POST', url: '/trpc/assistant.ask', payload: { text: 'spegni pc' } });
    assert.equal(res.json().result.data.steps[0].status, 'awaiting confirmation');
    assert.deepEqual(pending[0]?.input, {});
    assert.equal(
      commands.some((call) => call[1] === 'poweroff'),
      false,
    );
    assert.ok(pending[0]);
    await confirmations.confirm(pending[0].id);
    assert.equal(commands.filter((call) => call[1] === 'poweroff').length, 1);
  } finally {
    unsubscribe();
    await app.close();
  }
});
