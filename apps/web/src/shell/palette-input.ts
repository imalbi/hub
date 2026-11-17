import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';

export type RegistryAction = inferRouterOutputs<AppRouter>['registry']['list'][number];
type Schema = NonNullable<RegistryAction['schema']>;
export type PaletteField = { name: string; required: boolean; schema: Schema };

export function paletteFields(schema: RegistryAction['schema'], danger: boolean): PaletteField[] | null {
  if (schema === null) return [];
  if (
    !schema ||
    schema.type !== 'object' ||
    !schema.properties ||
    schema.allOf ||
    schema.anyOf ||
    schema.oneOf ||
    schema.not ||
    schema.additionalProperties
  )
    return null;
  const fields: PaletteField[] = [];
  for (const [name, field] of Object.entries(schema.properties)) {
    if (typeof field !== 'object' || !field) return null;
    if (danger && name === 'confirmed' && field.const === true) continue;
    const required = schema.required?.includes(name) ?? false;
    const drawable =
      ['string', 'number', 'integer', 'boolean'].includes(String(field.type)) &&
      !field.anyOf &&
      !field.oneOf &&
      !field.allOf &&
      !field.not &&
      field.const === undefined;
    // An optional field the palette cannot draw is left out: the action is valid without it (`notes.add`'s `about`, step 71).
    if (!drawable && !required) continue;
    if (!drawable) return null;
    fields.push({ name, required, schema: field });
  }
  return fields;
}
