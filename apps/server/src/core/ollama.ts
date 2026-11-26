import { z } from 'zod';

export class OllamaError extends Error {
  readonly status: number | undefined;
  constructor(status?: number) {
    super('Ollama request failed');
    this.status = status;
  }
}

export const ollamaUrl = 'http://127.0.0.1:11434/api/chat';
export const ollamaSystemOneUrl = 'http://127.0.0.1:11434/v1/systemone';

const questionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('choice'),
    instructions: z.string(),
    criteria: z.record(z.string(), z.string().nullable()),
  }),
  z.strictObject({
    type: z.literal('noul'),
    instructions: z.string(),
    criteria: z.strictObject({ false: z.string().optional(), true: z.string().optional() }).optional(),
  }),
  z.strictObject({ type: z.literal('score'), instructions: z.string(), criteria: z.array(z.string()).min(2).max(10) }),
]);
const probabilitySchema = z.number().min(0).max(1);
const systemOneResponseSchema = z.strictObject({
  model: z.string(),
  answers: z.record(
    z.string(),
    z.discriminatedUnion('type', [
      z.strictObject({
        type: z.literal('choice'),
        choice: z.string(),
        probabilities: z.record(z.string(), probabilitySchema),
        confidence: probabilitySchema,
      }),
      z.strictObject({ type: z.literal('noul'), noul: probabilitySchema }),
      z.strictObject({
        type: z.literal('score'),
        score: z.number().min(0).max(9),
        legend: z.record(z.string(), z.string()),
        probabilities: z.record(z.string(), probabilitySchema),
        confidence: probabilitySchema,
      }),
    ]),
  ),
  usage: z.strictObject({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

export async function ollamaSystemOne(
  fetcher: typeof fetch,
  input: {
    model: string;
    state: string | Record<string, unknown> | unknown[];
    questions: Record<string, z.infer<typeof questionSchema>>;
    signal?: AbortSignal;
  },
) {
  try {
    const questions = z.record(z.string(), questionSchema).parse(input.questions);
    const response = await fetcher(ollamaSystemOneUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: input.signal,
      body: JSON.stringify({ model: input.model, state: input.state, questions }),
    });
    if (!response.ok) throw new OllamaError(response.status);
    const parsed = systemOneResponseSchema.parse(await response.json());
    if (Object.keys(parsed.answers).length !== Object.keys(questions).length) throw new OllamaError();
    for (const [key, question] of Object.entries(questions)) {
      const answer = parsed.answers[key];
      if (!answer || answer.type !== question.type) throw new OllamaError();
      if (question.type === 'choice' && answer.type === 'choice' && !Object.hasOwn(question.criteria, answer.choice))
        throw new OllamaError();
      if (question.type === 'score' && answer.type === 'score' && answer.score > question.criteria.length - 1)
        throw new OllamaError();
    }
    return parsed;
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    throw new OllamaError();
  }
}

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
    keepAlive?: string;
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
        ...(input.keepAlive && { keep_alive: input.keepAlive }),
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
