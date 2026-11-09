import { Input } from '../components/ui/input.tsx';
import { MultiSelect } from '../components/ui/multi-select.tsx';
import { Select } from '../components/ui/select.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { TagInput } from '../components/ui/tag-input.tsx';
import { m } from '../paraglide/messages.js';
import { SecretField } from './secret-field.tsx';
import type { Field } from './schema-fields.ts';

const tagCopy = {
  limit: m.settings_tags_limit(),
  create: (text: string) => m.settings_tags_create({ text }),
  alreadyHere: (name: string) => m.settings_tags_already({ name }),
  manyAlreadyHere: (count: number) => m.settings_tags_many_already({ count }),
  isLabelled: (value: string, label: string) => m.settings_tags_labelled({ value, label }),
  added: (name: string) => m.settings_tags_added({ name }),
  addedMany: (count: number) => m.settings_tags_added_many({ count }),
  invalid: (count: number) => m.settings_tags_invalid({ count }),
  duplicates: (count: number) => m.settings_tags_duplicates({ count }),
  removed: (name: string) => m.settings_tags_removed({ name }),
  editing: (value: string) => m.settings_tags_editing({ value }),
  cleared: m.settings_tags_cleared(),
  remove: (name: string) => m.settings_tags_remove({ name }),
  lookingUp: m.settings_tags_lookup(),
  suggestions: (label: string) => m.settings_tags_suggestions({ label }),
  keys: m.settings_tags_keys(),
};
const multiCopy = {
  filter: m.settings_multi_filter(),
  selectAll: m.settings_multi_all(),
  selectNone: m.settings_multi_none(),
  none: m.settings_multi_nothing(),
};

const asStrings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** One flat field of the form as the control that fits its type. `value` is the draft; `undefined` means "not set". */
export function FieldControl({
  field,
  value,
  saved,
  error,
  onChange,
}: {
  field: Field;
  value: unknown;
  saved: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const { label, placeholder } = field;
  switch (field.kind) {
    case 'secret':
      return <SecretField label={label} value={value} saved={saved} onChange={onChange} />;
    case 'boolean':
      return <Switch label={label} checked={value === true} onCheckedChange={onChange} labelPosition="start" />;
    case 'choice':
      return (
        <Select
          label={label}
          error={error}
          value={typeof value === 'string' ? value : null}
          placeholder={placeholder}
          options={field.options.map((option) => ({ value: option, label: option }))}
          onValueChange={onChange}
        />
      );
    case 'multi':
      return (
        <MultiSelect
          label={label}
          error={error}
          copy={multiCopy}
          placeholder={m.settings_multi_placeholder()}
          value={asStrings(value)}
          options={field.options.map((option) => ({ value: option, label: option }))}
          onValueChange={(next) => onChange(next.length > 0 ? next : undefined)}
        />
      );
    case 'words':
      return (
        <TagInput
          label={label}
          copy={tagCopy}
          allowCreate
          value={asStrings(value).map((word) => ({ id: word, value: word }))}
          onValueChange={(tags) => {
            const words = tags.filter((tag) => !tag.error).map((tag) => tag.value);
            onChange(words.length > 0 ? words : undefined);
          }}
          hint={error}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          label={label}
          error={error}
          step={field.integer ? 1 : 'any'}
          placeholder={placeholder}
          value={typeof value === 'number' ? value : ''}
          onValueChange={(text) => onChange(text === '' ? undefined : Number(text))}
        />
      );
    case 'text':
    default:
      return (
        <Input
          label={label}
          error={error}
          placeholder={placeholder}
          value={typeof value === 'string' ? value : ''}
          onValueChange={(text) => onChange(text === '' ? undefined : text)}
        />
      );
  }
}
