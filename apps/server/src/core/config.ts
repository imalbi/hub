import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { publicModules } from '../modules.ts';
import { coreConfigSchema } from './config-schema.ts';
import { moduleConfigShape } from './module.ts';

export const configSchema = coreConfigSchema.extend(moduleConfigShape(publicModules));
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

/** The file `loadConfig` reads and Impostazioni writes. */
export const configFilePath = () => process.env.HUB_CONFIG ?? defaultPath;

/** A missing file is an empty config; an unreadable or invalid one throws a message that names the file. */
export function loadConfig(path = configFilePath()): Config {
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
