import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const configSchema = z.object({
  audio: z
    .object({
      outputs: z.array(
        z.object({
          label: z.string().min(1),
          // Case-insensitive substring of the PipeWire node.description; device names are personal, so they live in config.
          match: z.string().min(1),
        }),
      ),
    })
    .default({ outputs: [] }),
});

export type Config = z.infer<typeof configSchema>;

export const emptyConfig: Config = configSchema.parse({});

const defaultPath = fileURLToPath(new URL('../../../config.local.json', import.meta.url));

/** A missing file is an empty config; an unreadable or invalid one throws a message that names the file. */
export function loadConfig(path = process.env.HUB_CONFIG ?? defaultPath): Config {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return emptyConfig;
    throw error;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Config ${path} is not valid JSON`);
  }

  const parsed = configSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Invalid config ${path}:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
