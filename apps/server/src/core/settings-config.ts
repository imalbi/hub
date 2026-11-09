import { z } from 'zod';

/** Pure helpers for Impostazioni: secret fields of a module schema, and the config file as plain JSON. */

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a client sends back for a secret it left alone. */
const isKept = (value: unknown) => isObject(value) && Object.keys(value).length === 1 && value.set === true;

/** The module's JSON Schema as the form reads it: input side, with anything zod cannot draw left open. */
export const formSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

/** Property paths marked `.meta({ secret: true })`, at any depth through objects and unions. */
export function secretPaths(schema: z.ZodType): string[][] {
  const walk = (node: unknown, path: string[]): string[][] => {
    if (!isObject(node)) return [];
    if (node.secret === true) return [path];
    const branches = [node.anyOf, node.oneOf, node.allOf].flatMap((list) => (Array.isArray(list) ? list : []));
    return [
      ...(isObject(node.properties)
        ? Object.entries(node.properties).flatMap(([key, child]) => walk(child, [...path, key]))
        : []),
      ...branches.flatMap((branch) => walk(branch, path)),
    ];
  };
  return walk(formSchema(schema), []);
}

export function getAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) current = isObject(current) ? current[key] : undefined;
  return current;
}

/** A copy of `root` with `value` at `path`; `undefined` removes the key. Objects on the way are made when missing. */
export function setAt(root: Json, path: readonly string[], value: unknown): Json {
  const [key, ...rest] = path;
  if (key === undefined) return root;
  const next = { ...root };
  if (rest.length === 0) {
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
  }
  const child = isObject(next[key]) ? next[key] : {};
  next[key] = setAt(child, rest, value);
  return next;
}

/** `{ set: true }` in place of every secret that holds a value; a secret that is absent stays absent. */
export function redact(value: unknown, paths: readonly (readonly string[])[]): unknown {
  let result = value;
  for (const path of paths)
    if (isObject(result) && getAt(result, path) !== undefined) result = setAt(result, path, { set: true });
  return result;
}

/** A secret the client returned as `{ set: true }` takes the stored value (or none); anything else is a replacement. */
export function restoreSecrets(incoming: unknown, stored: unknown, paths: readonly (readonly string[])[]): unknown {
  let result = incoming;
  for (const path of paths)
    if (isObject(result) && isKept(getAt(result, path))) result = setAt(result, path, getAt(stored, path));
  return result;
}

export { isObject };
