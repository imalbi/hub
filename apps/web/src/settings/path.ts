import type { Path } from './schema-fields.ts';

/** Plain-JSON path helpers for the form's draft value (the same shape as the config file's slice). */
type Json = Record<string, unknown>;
export const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function getAt(value: unknown, path: Path): unknown {
  let current = value;
  for (const key of path) current = isObject(current) ? current[key] : undefined;
  return current;
}

/** A copy with `value` at `path`; `undefined` removes the key, and an object left empty by that is dropped too. */
export function setAt(root: unknown, path: Path, value: unknown): unknown {
  const base = isObject(root) ? root : {};
  const [key, ...rest] = path;
  if (key === undefined) return value;
  const next = { ...base };
  const child = rest.length === 0 ? value : setAt(next[key], rest, value);
  if (child === undefined || (rest.length > 0 && isObject(child) && Object.keys(child).length === 0)) delete next[key];
  else next[key] = child;
  return next;
}

export const samePath = (a: Path, b: Path) => a.length === b.length && a.every((key, index) => key === b[index]);
export const startsWith = (path: Path, prefix: Path) => prefix.every((key, index) => path[index] === key);
