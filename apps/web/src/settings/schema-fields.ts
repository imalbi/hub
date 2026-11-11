/**
 * Turns a module's JSON Schema (`settings.config`) into what the form draws: flat fields as real controls, and the
 * parts that are not flat (maps, lists of objects, unions) as blocks edited as JSON. Pure, so it is tested alone.
 */

export type Path = readonly string[];

type Base = { path: Path; label: string; placeholder?: string; description?: string };
export type Field =
  | (Base & { kind: 'text' })
  | (Base & { kind: 'multiline' })
  | (Base & { kind: 'number'; integer: boolean })
  | (Base & { kind: 'boolean' })
  | (Base & { kind: 'choice'; options: readonly string[] })
  | (Base & { kind: 'multi'; options: readonly string[] })
  | (Base & { kind: 'words' })
  | (Base & { kind: 'secret' });
export type Block = { path: Path; label: string };
export type Form = { fields: Field[]; blocks: Block[] };

type Schema = Record<string, unknown>;
const isSchema = (value: unknown): value is Schema =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value.map(String) : undefined;

/** `{ anyOf: [X, { type: 'null' }] }` is X; any other union has no single control. */
function unwrap(node: Schema): Schema {
  const branches = [node.anyOf, node.oneOf].find(Array.isArray);
  if (!branches) return node;
  const rest = branches.filter((branch) => !(isSchema(branch) && branch.type === 'null'));
  const [only] = rest;
  return rest.length === 1 && isSchema(only) ? { ...only, ...(node.secret === true && { secret: true }) } : node;
}

const placeholderOf = (node: Schema) =>
  typeof node.default === 'string' || typeof node.default === 'number' ? String(node.default) : undefined;

/** The control a leaf schema maps to, or `undefined` when it is not flat. */
function leaf(node: Schema, base: Base): Field | undefined {
  if (node.secret === true) return { ...base, kind: 'secret' };
  const choices = strings(node.enum);
  if (choices) return { ...base, kind: 'choice', options: choices };
  if (node.type === 'string') return { ...base, kind: node.multiline === true ? 'multiline' : 'text' };
  if (node.type === 'number' || node.type === 'integer')
    return { ...base, kind: 'number', integer: node.type === 'integer' };
  if (node.type === 'boolean') return { ...base, kind: 'boolean' };
  if (node.type === 'array' && isSchema(node.items)) {
    const items = unwrap(node.items);
    const options = strings(items.enum);
    if (options) return { ...base, kind: 'multi', options };
    if (items.type === 'string' && items.secret !== true) return { ...base, kind: 'words' };
  }
  return undefined;
}

export function buildForm(schema: unknown): Form {
  const form: Form = { fields: [], blocks: [] };
  const walk = (raw: unknown, path: Path) => {
    if (!isSchema(raw)) return;
    const node = unwrap(raw);
    const field = leaf(node, {
      path,
      label: typeof node.title === 'string' ? node.title : (path.at(-1) ?? ''),
      placeholder: placeholderOf(node),
      description: typeof node.description === 'string' ? node.description : undefined,
    });
    if (field) form.fields.push(field);
    // A plain object recurses; a map (`additionalProperties` schema), an open object, a union or a list of objects is a block.
    else if (node.type === 'object' && isSchema(node.properties) && !isSchema(node.additionalProperties))
      for (const [key, child] of Object.entries(node.properties)) walk(child, [...path, key]);
    else if (path.length > 0) form.blocks.push({ path, label: path.join(' › ') });
  };
  walk(schema, []);
  return form;
}
