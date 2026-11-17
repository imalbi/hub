import { TRPCError, type AnyRouter } from '@trpc/server';
import { z } from 'zod';
import { callAgentAction } from './agent-action.ts';
import { assistantPrompt } from './assistant-prompt.ts';
import type { createConfirmations } from './confirmations.ts';
import { llmGate } from './llm-gate.ts';
import { ollamaChat } from './ollama.ts';
import { listActions } from './registry.ts';
import { loopbackProcedure, publicProcedure, router } from './trpc.ts';

// These actions change access or setup, which a sentence must never change.
export const deniedPrefixes = ['settings', 'agents', 'pairing', 'devices', 'confirmations'];
export function assistantActions(app: AnyRouter) {
  return listActions(app).filter(
    (action) =>
      action.kind === 'mutation' && !action.pageOnly && !deniedPrefixes.includes(action.path.split('.')[0] ?? ''),
  );
}

export function createAssistantRouter(
  app: () => AnyRouter,
  confirmations: ReturnType<typeof createConfirmations>,
  fetcher: typeof fetch,
) {
  return router({
    state: loopbackProcedure.query(({ ctx }) => ({ enabled: ctx.config.assistant.enabled })),
    ask: publicProcedure
      .meta({ label: 'Chiedi a Hub', description: 'Ask the local assistant', pageOnly: true })
      .input(z.object({ text: z.string().trim().min(1).max(300) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.client.kind !== 'loopback') throw new TRPCError({ code: 'UNAUTHORIZED' });
        const config = ctx.config.assistant;
        if (!config.enabled) throw new TRPCError({ code: 'PRECONDITION_FAILED' });
        const actions = assistantActions(app());
        const tools = actions.map((action) => ({
          type: 'function',
          function: {
            name: action.path.replaceAll('.', '_'),
            description: `${action.label}. ${action.description}`,
            parameters: action.schema ?? { type: 'object' },
          },
        }));
        let answer;
        try {
          answer = await llmGate(
            0,
            (signal) =>
              ollamaChat(fetcher, {
                model: config.model,
                numCtx: config.numCtx,
                signal,
                messages: [
                  { role: 'system', content: assistantPrompt(new Date()) },
                  { role: 'user', content: input.text },
                ],
                tools,
              }),
            { counted: false, front: true },
          );
        } catch {
          return { steps: [], text: 'Il modello locale non è disponibile.' };
        }
        if (answer.promptEvalCount === undefined || answer.promptEvalCount >= config.numCtx - 512)
          return { steps: [], text: 'Troppe azioni per il modello: alza il contesto in Impostazioni' };
        const steps: {
          path: string;
          label: string;
          status: 'done' | 'awaiting confirmation' | 'refused' | 'failed';
        }[] = [];
        for (const [index, call] of answer.calls.entries()) {
          const args = { ...call.function.arguments };
          delete args.confirmed;
          const matching = actions.filter((item) => item.path.replaceAll('.', '_') === call.function.name);
          const action = matching.length === 1 ? matching[0] : undefined;
          if (!action || index >= 3) {
            steps.push({ path: call.function.name, label: call.function.name, status: 'refused' });
            continue;
          }
          const result = await callAgentAction(
            app(),
            confirmations,
            ctx,
            { kind: 'agent', agentId: 0, name: 'assistente' },
            action.path,
            args,
          );
          const pending =
            typeof result.result === 'object' &&
            result.result !== null &&
            'status' in result.result &&
            result.result.status === 'awaiting confirmation';
          steps.push({
            path: action.path,
            label: action.label,
            status: result.isError ? 'failed' : pending ? 'awaiting confirmation' : 'done',
          });
        }
        return { steps, ...(steps.length === 0 && answer.text ? { text: answer.text } : {}) };
      }),
  });
}
