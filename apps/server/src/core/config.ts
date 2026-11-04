import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Pomodoro durations, from the config and overridden by the settings the owner saves from the UI (`pomodoro.configure`). */
export const pomodoroDurationsSchema = z.object({
  focusMinutes: z.number().positive().max(1440),
  shortBreakMinutes: z.number().positive().max(1440),
  longBreakMinutes: z.number().positive().max(1440),
  // 0 means never a long break.
  longBreakEvery: z.number().int().min(0).max(100),
});

const durations = pomodoroDurationsSchema.shape;

const configSchema = z.object({
  pomodoro: z
    .object({
      focusMinutes: durations.focusMinutes.default(25),
      shortBreakMinutes: durations.shortBreakMinutes.default(5),
      longBreakMinutes: durations.longBreakMinutes.default(15),
      longBreakEvery: durations.longBreakEvery.default(4),
    })
    .default({ focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 }),
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
  server: z
    .object({
      // Where to listen. Loopback until the deck is paired; `0.0.0.0` (or a LAN address) opens Hub to the home network.
      host: z.string().min(1).default('127.0.0.1'),
      // Extra page origins allowed to open the WebSocket (the deck on the LAN); dev origins are built in.
      allowedOrigins: z.array(z.string().min(1)).default([]),
    })
    .default({ host: '127.0.0.1', allowedOrigins: [] }),
  theme: z
    .object({
      // Caelestia's color scheme file. Unset means the Caelestia theme is off; `src/index.ts` fills in the usual path.
      caelestiaScheme: z.string().min(1).optional(),
    })
    .default({}),
  system: z
    .object({
      // Where the owner's powerstat tracker writes status.json and samples.csv. Unset hides consumption.
      powerstatDir: z.string().min(1).optional(),
    })
    .default({}),
  // The owner's web dev digest. `page` is the HTML it writes, `stateFile` the JSON it keeps (its mtime is the last
  // run), `command` the script, run with --no-open. Unset `page` hides news.
  news: z
    .object({
      page: z.string().min(1).optional(),
      stateFile: z.string().min(1).optional(),
      command: z.string().min(1).optional(),
    })
    .default({}),
});

export type Config = z.infer<typeof configSchema>;

export const emptyConfig: Config = configSchema.parse({});

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/** A host reachable from the LAN with no allowed origin would start fine and then refuse every page, so refuse to start instead. */
export function assertCanListen({ server }: Config) {
  if (LOOPBACK_HOSTS.has(server.host) || server.allowedOrigins.length > 0) return;
  throw new Error(
    `server.host is ${server.host}, which the LAN can reach, but server.allowedOrigins is empty and every page would be refused. ` +
      'Add the origin the deck opens, for example http://<pc-name>.local:4180',
  );
}

const defaultPath = fileURLToPath(new URL('../../../../config.local.json', import.meta.url));

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
