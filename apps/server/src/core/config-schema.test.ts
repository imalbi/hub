import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coreConfigSchema } from './config-schema.ts';

void test('MCP is enabled by default and can be disabled', () => {
  assert.equal(coreConfigSchema.parse({}).mcp.enabled, true);
  assert.equal(coreConfigSchema.parse({}).mcp.client, 'claude');
  assert.equal(coreConfigSchema.parse({ mcp: { enabled: false } }).mcp.enabled, false);
  assert.equal(coreConfigSchema.parse({ mcp: { enabled: true, client: 'codex' } }).mcp.client, 'codex');
  assert.equal(coreConfigSchema.safeParse({ mcp: { enabled: true, client: 'other' } }).success, false);
});

void test('the server host is marked for manual changes', () => {
  assert.equal(coreConfigSchema.shape.server.unwrap().shape.host.meta()?.manual, true);
});
