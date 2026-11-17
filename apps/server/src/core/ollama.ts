import { z } from 'zod';

export class OllamaError extends Error {
  readonly status: number | undefined;
  constructor(status?: number) {
    super('Ollama request failed');
    this.status = status;
  }
}

export const ollamaUrl = 'http://127.0.0.1:11434/api/chat';

type Tool = { type: string; function: { name: string; description: string; parameters: object } };
type Message = { role: 'system' | 'user' | 'assistant'; content: string };
const responseSchema = z.object({
  message: z.object({
    content: z.string().default(''),
    tool_calls: z
      .array(z.object({ function: z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) }) }))
      .default([]),
  }),
  prompt_eval_count: z.number().optional(),
});

export async function ollamaChat(
  fetcher: typeof fetch,
  input: {
    model: string;
    messages: Message[];
    tools?: Tool[];
    numCtx: number;
    signal?: AbortSignal;
    format?: object;
    temperature?: number;
  },
) {
  try {
    const response = await fetcher(ollamaUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: input.signal,
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        ...(input.tools && { tools: input.tools }),
        stream: false,
        think: false,
        ...(input.format && { format: input.format }),
        options: { num_ctx: input.numCtx, temperature: input.temperature ?? 0 },
      }),
    });
    if (!response.ok) throw new OllamaError(response.status);
    const parsed = responseSchema.parse(await response.json());
    return {
      text: parsed.message.content,
      calls: parsed.message.tool_calls,
      promptEvalCount: parsed.prompt_eval_count,
    };
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    throw new OllamaError();
  }
}
