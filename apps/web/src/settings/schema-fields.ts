/**
 * Turns a module's JSON Schema (`settings.config`) into what the form draws: flat fields as real controls, and the
 * parts that are not flat (nested lists, unions) as blocks edited as JSON. Pure, so it is tested alone.
 *
 * Human labels come from the module's zod `.meta()`: `title`, `description`, `unit`, and `optionLabels`
 * (a `{ [value]: label }` object on an enum, an integer, or an array of either).
 */

export type Path = readonly string[];

export type Option = { value: string | number; label: string };

type Base = {
  path: Path;
  label: string;
  description?: string;
  unit?: string;
  /** Schema `default`, for "Predefinito: X". Never written to the config. */
  default?: unknown;
  /** Not in the parent's `required` list: it may stay unset. */
  optional: boolean;
  placeholder?: string;
};

/** A cell of a `rows` field: a flat field whose path is `[propertyKey]`. */
export type Column = Extract<Field, { kind: 'text' | 'number' | 'boolean' | 'choice' }>;

export type Field =
  | (Base & { kind: 'text' })
  | (Base & { kind: 'multiline' })
  | (Base & { kind: 'number'; integer: boolean; min?: number; max?: number })
  | (Base & { kind: 'boolean' })
  | (Base & { kind: 'choice'; options: readonly Option[] })
  | (Base & { kind: 'multi'; options: readonly Option[] })
  | (Base & { kind: 'words' })
  | (Base & { kind: 'secret' })
  /** `z.record(string, number)`: one "key: number" row per entry. */
  | (Base & { kind: 'numberMap'; integer: boolean })
  /** `z.record(string, z.array(z.string()))`: one "key: words" row per entry. */
  | (Base & { kind: 'wordsMap' })
  /** An array of flat objects: a table, one row per item, one cell per column. */
  | (Base & { kind: 'rows'; columns: readonly Column[] });

/** What has no simple control: edited as JSON. */
export type Block = { path: Path; label: string; description?: string };
/** A plain object that holds fields: its heading is `label` (object title, else last key). */
export type Section = { path: Path; label: string; description?: string };
export type Form = { fields: Field[]; blocks: Block[]; sections: Section[] };

type Schema = Record<string, unknown>;
const isSchema = (value: unknown): value is Schema =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value.map(String) : undefined;
const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const numeric = (value: unknown) => (typeof value === 'number' ? value : undefined);

/** `{ anyOf: [X, { type: 'null' }] }` is X; any other union has no single control. */
function unwrap(node: Schema): Schema {
  const branches = [node.anyOf, node.oneOf].find(Array.isArray);
  if (!branches) return node;
  const rest = branches.filter((branch) => !(isSchema(branch) && branch.type === 'null'));
  const [only] = rest;
  if (rest.length !== 1 || !isSchema(only)) return node;
  // Meta set on the union itself wins over the branch's.
  const { anyOf: _a, oneOf: _o, ...outer } = node;
  return { ...only, ...outer };
}

const placeholderOf = (node: Schema) =>
  typeof node.default === 'string' || typeof node.default === 'number' ? String(node.default) : undefined;

const labelsOf = (...nodes: Schema[]): Record<string, string> => {
  for (const node of nodes) {
    const labels = node.optionLabels;
    if (isSchema(labels)) {
      const entries = Object.entries(labels).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
      return Object.fromEntries(entries);
    }
  }
  return {};
};

/** Options of a closed set: a string enum, or an integer with `optionLabels` (its keys, as numbers). */
function optionsOf(node: Schema, ...labelSources: Schema[]): Option[] | undefined {
  const labels = labelsOf(node, ...labelSources);
  const choices = strings(node.enum);
  if (choices) return choices.map((value) => ({ value, label: labels[value] ?? value }));
  if (node.type === 'integer') {
    const numbers = Object.keys(labels)
      .map((key) => ({ value: Number(key), label: labels[key] ?? key }))
      .filter((option) => Number.isInteger(option.value));
    if (numbers.length > 0) return numbers;
  }
  return undefined;
}

/** The control a leaf schema maps to, or `undefined` when it is not flat. */
function leaf(node: Schema, base: Base): Field | undefined {
  if (node.secret === true) return { ...base, kind: 'secret' };
  const options = optionsOf(node);
  if (options) return { ...base, kind: 'choice', options };
  if (node.type === 'string') return { ...base, kind: node.multiline === true ? 'multiline' : 'text' };
  if (node.type === 'number' || node.type === 'integer')
    return {
      ...base,
      kind: 'number',
      integer: node.type === 'integer',
      min: numeric(node.minimum),
      max: numeric(node.maximum),
    };
  if (node.type === 'boolean') return { ...base, kind: 'boolean' };
  if (node.type === 'array' && isSchema(node.items)) {
    const items = unwrap(node.items);
    const multi = optionsOf(items, node);
    if (multi) return { ...base, kind: 'multi', options: multi };
    if (items.type === 'string' && items.secret !== true) return { ...base, kind: 'words' };
    const columns = columnsOf(items);
    if (columns) return { ...base, kind: 'rows', columns };
  }
  const extra = isSchema(node.additionalProperties) ? unwrap(node.additionalProperties) : undefined;
  if (node.type === 'object' && extra && !isSchema(node.properties)) {
    if (extra.type === 'number' || extra.type === 'integer')
      return { ...base, kind: 'numberMap', integer: extra.type === 'integer' };
    if (extra.type === 'array' && isSchema(extra.items) && unwrap(extra.items).type === 'string')
      return { ...base, kind: 'wordsMap' };
  }
  return undefined;
}

const common = (node: Schema, path: Path, required: boolean, raw: Schema = node): Base => ({
  path,
  label: text(node.title) ?? path.at(-1) ?? '',
  description: text(node.description),
  unit: text(node.unit),
  default: node.default ?? raw.default,
  optional: !required,
  placeholder: placeholderOf(node) ?? placeholderOf(raw),
});

const requiredKeys = (node: Schema) => strings(node.required) ?? [];

/** Columns when every property of the item object is a flat text, number, boolean or choice; else `undefined`. */
function columnsOf(items: Schema): Column[] | undefined {
  if (items.type !== 'object' || !isSchema(items.properties)) return undefined;
  const required = requiredKeys(items);
  const columns: Column[] = [];
  for (const [key, raw] of Object.entries(items.properties)) {
    if (!isSchema(raw)) return undefined;
    const node = unwrap(raw);
    const field = leaf(node, common(node, [key], required.includes(key), raw));
    if (!field) return undefined;
    if (field.kind !== 'text' && field.kind !== 'number' && field.kind !== 'boolean' && field.kind !== 'choice')
      return undefined;
    columns.push(field);
  }
  return columns.length > 0 ? columns : undefined;
}

export function buildForm(schema: unknown): Form {
  const form: Form = { fields: [], blocks: [], sections: [] };
  const walk = (raw: unknown, path: Path, required: boolean) => {
    if (!isSchema(raw)) return;
    const node = unwrap(raw);
    const field = leaf(node, common(node, path, required, raw));
    if (field) form.fields.push(field);
    // A plain object recurses; an open object, a union or a list of non-flat objects is a block.
    else if (node.type === 'object' && isSchema(node.properties) && !isSchema(node.additionalProperties)) {
      if (path.length > 0)
        form.sections.push({ path, label: text(node.title) ?? path.at(-1) ?? '', description: text(node.description) });
      const requiredHere = requiredKeys(node);
      for (const [key, child] of Object.entries(node.properties))
        walk(child, [...path, key], requiredHere.includes(key));
    } else if (path.length > 0)
      form.blocks.push({ path, label: text(node.title) ?? path.at(-1) ?? '', description: text(node.description) });
  };
  walk(schema, [], true);
  return form;
}
