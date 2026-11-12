import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';

/** Pure helpers for Impostazioni: secret fields of a module schema, and the config file as plain JSON. */

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a client sends back for a secret it left alone. */
const isKept = (value: unknown) => isObject(value) && Object.keys(value).length === 1 && value.set === true;

/** The module's JSON Schema as the form reads it: input side, with anything zod cannot draw left open. */
export const formSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

/** Detect changes to any manually managed field, including secrets in arrays and unions. */
export function hasManualChanges(schema: z.ZodType, before: unknown, after: unknown): boolean {
  const walk = (node: unknown, oldValue: unknown, newValue: unknown): boolean => {
    if (!isObject(node)) return false;
    if (node.manual === true || node.secret === true) return !isDeepStrictEqual(oldValue, newValue);
    const branches = [node.anyOf, node.oneOf, node.allOf].flatMap((list) => (Array.isArray(list) ? list : []));
    if (branches.some((branch) => walk(branch, oldValue, newValue))) return true;
    if (isObject(node.properties)) {
      for (const [key, child] of Object.entries(node.properties)) {
        if (walk(child, isObject(oldValue) ? oldValue[key] : undefined, isObject(newValue) ? newValue[key] : undefined))
          return true;
      }
    }
    if (isObject(node.additionalProperties)) {
      const oldObject = isObject(oldValue) ? oldValue : {};
      const newObject = isObject(newValue) ? newValue : {};
      const properties = isObject(node.properties) ? node.properties : {};
      for (const key of new Set([...Object.keys(oldObject), ...Object.keys(newObject)]))
        if (!(key in properties) && walk(node.additionalProperties, oldObject[key], newObject[key])) return true;
    }
    if (node.items && (Array.isArray(oldValue) || Array.isArray(newValue))) {
      const oldItems = Array.isArray(oldValue) ? oldValue : [];
      const newItems = Array.isArray(newValue) ? newValue : [];
      for (let index = 0; index < Math.max(oldItems.length, newItems.length); index++)
        if (walk(node.items, oldItems[index], newItems[index])) return true;
    }
    return false;
  };
  return walk(formSchema(schema), before, after);
}

function mapSecrets(node: unknown, value: unknown, stored: unknown, restoring: boolean): unknown {
  if (!isObject(node)) return value;
  if (node.secret === true) {
    if (restoring) return isKept(value) ? stored : value;
    return value === undefined ? undefined : { set: true };
  }
  let result = value;
  for (const branches of [node.anyOf, node.oneOf, node.allOf])
    if (Array.isArray(branches)) for (const branch of branches) result = mapSecrets(branch, result, stored, restoring);
  if (isObject(node.properties) && isObject(result)) {
    const copy = { ...result };
    for (const [key, child] of Object.entries(node.properties)) {
      if (key in copy) copy[key] = mapSecrets(child, copy[key], isObject(stored) ? stored[key] : undefined, restoring);
    }
    result = copy;
  }
  if (isObject(node.additionalProperties) && isObject(result)) {
    const copy = { ...result };
    const properties = isObject(node.properties) ? node.properties : {};
    for (const key of Object.keys(copy))
      if (!(key in properties))
        copy[key] = mapSecrets(
          node.additionalProperties,
          copy[key],
          isObject(stored) ? stored[key] : undefined,
          restoring,
        );
    result = copy;
  }
  if (node.items && Array.isArray(result)) {
    const previous = Array.isArray(stored) ? stored : [];
    result = result.map((item, index) => mapSecrets(node.items, item, previous[index], restoring));
  }
  return result;
}

export function redactSchema(schema: z.ZodType, value: unknown): unknown {
  return mapSecrets(formSchema(schema), value, undefined, false);
}

export function restoreSchemaSecrets(schema: z.ZodType, incoming: unknown, stored: unknown): unknown {
  return mapSecrets(formSchema(schema), incoming, stored, true);
}

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
