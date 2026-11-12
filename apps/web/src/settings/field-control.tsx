import { useId } from 'react';
import { Input } from '../components/ui/input.tsx';
import { MultiSelect } from '../components/ui/multi-select.tsx';
import { Select } from '../components/ui/select.tsx';
import { StepperInput } from '../components/ui/stepper-input.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { TagInput } from '../components/ui/tag-input.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import { m } from '../paraglide/messages.js';
import { multiCopy, tagCopy } from './field-copy.ts';
import { FieldShell } from './field-shell.tsx';
import { MapRows } from './map-rows.tsx';
import { ObjectRows } from './object-rows.tsx';
import { SecretField } from './secret-field.tsx';
import type { Field } from './schema-fields.ts';

const asStrings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Controls that fill one column of a section's grid; the rest take the whole row. */
export const isWide = (field: Field) => !['text', 'number', 'boolean', 'choice', 'secret'].includes(field.kind);

/** The default as text for "Predefinito: X", through the option labels of a choice. */
function defaultText(field: Field): string | undefined {
  const fallback = field.default;
  if (field.kind === 'number' && typeof fallback === 'number') return [fallback, field.unit].filter(Boolean).join(' ');
  if (field.kind === 'choice') return field.options.find((option) => option.value === fallback)?.label;
  if (field.kind === 'boolean' && typeof fallback === 'boolean') return fallback ? m.settings_yes() : m.settings_no();
  if ((field.kind === 'text' || field.kind === 'multiline') && typeof fallback === 'string' && fallback !== '')
    return fallback;
  return undefined;
}

/** One caption line: the description, then what an unset field falls back to. Never written to the config. */
function captionOf(field: Field, value: unknown): string | undefined {
  const parts = [field.description];
  const simple = ['text', 'multiline', 'number', 'choice', 'boolean'].includes(field.kind);
  if (simple && (value === undefined || value === '')) {
    const fallback = defaultText(field);
    if (fallback !== undefined) parts.push(m.settings_default({ value: fallback }));
    else if (field.optional) parts.push(m.settings_unset());
  }
  return parts.filter(Boolean).join(' ') || undefined;
}

/** One field of the form as the control that fits its type. `value` is the draft; `undefined` means "not set". */
export function FieldControl({
  field,
  value,
  saved,
  error,
  onChange,
  onBlock,
}: {
  field: Field;
  value: unknown;
  saved: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  /** A control that holds invalid rows tells the page, so Salva waits (like a broken JSON block). */
  onBlock: (error: string | null) => void;
}) {
  const id = useId();
  const { label, placeholder } = field;
  const caption = captionOf(field, value);
  const options = 'options' in field ? field.options.map((o) => ({ value: String(o.value), label: o.label })) : [];
  const shell = (control: React.ReactNode, aside?: React.ReactNode) => (
    <FieldShell id={id} label={label} caption={caption} error={error} aside={aside}>
      {control}
    </FieldShell>
  );
  const described = error ? `${id}-error` : caption ? `${id}-hint` : undefined;

  switch (field.kind) {
    case 'multiline':
      return (
        <Textarea
          label={label}
          hint={caption}
          error={error}
          placeholder={placeholder}
          value={typeof value === 'string' ? value : ''}
          onValueChange={(text) => onChange(text === '' ? undefined : text)}
        />
      );
    case 'secret':
      return (
        <div className="flex flex-col gap-2xs">
          <SecretField label={label} value={value} saved={saved} onChange={onChange} />
          {field.description && <p className="pl-sm text-caption text-muted-foreground">{field.description}</p>}
        </div>
      );
    case 'boolean':
      return shell(
        <Switch
          aria-labelledby={`${id}-label`}
          aria-describedby={described}
          checked={(value ?? field.default) === true}
          onCheckedChange={onChange}
        />,
      );
    case 'choice':
      return (
        <Select
          label={label}
          hint={caption}
          error={error}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : null}
          placeholder={defaultText(field) ?? placeholder}
          options={options}
          onValueChange={(next) => onChange(field.options.find((option) => String(option.value) === next)?.value)}
        />
      );
    case 'multi':
      return (
        <MultiSelect
          label={label}
          hint={caption}
          error={error}
          copy={multiCopy}
          placeholder={m.settings_multi_placeholder()}
          value={Array.isArray(value) ? value.map((item) => String(item)) : []}
          options={options}
          onValueChange={(next) => {
            const picked = field.options.filter((option) => next.includes(String(option.value))).map((o) => o.value);
            onChange(picked.length > 0 ? picked : undefined);
          }}
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
          hint={error ?? caption}
        />
      );
    case 'number':
      return shell(
        <StepperInput
          labelledBy={`${id}-label`}
          describedBy={described}
          decreaseLabel={m.settings_decrease({ name: label })}
          increaseLabel={m.settings_increase({ name: label })}
          placeholder={placeholder}
          min={field.min}
          max={field.max}
          step={field.integer ? 1 : 0.1}
          unit={field.unit}
          className="w-full max-w-number-field"
          value={typeof value === 'number' ? value : undefined}
          onValueChange={onChange}
        />,
        field.optional && typeof value === 'number' && (
          <button
            type="button"
            aria-label={`${m.settings_restore_default()}: ${label}`}
            onClick={() => onChange(undefined)}
            className="text-caption text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-accent"
          >
            {m.settings_restore_default()}
          </button>
        ),
      );
    case 'numberMap':
    case 'wordsMap':
      return shell(
        <MapRows
          name={label}
          kind={field.kind === 'numberMap' ? 'number' : 'words'}
          integer={field.kind === 'numberMap' && field.integer}
          value={value}
          onChange={onChange}
          onBlock={onBlock}
        />,
      );
    case 'rows':
      return shell(<ObjectRows name={label} columns={field.columns} value={value} onChange={onChange} />);
    case 'text':
    default:
      return (
        <Input
          label={label}
          hint={caption}
          error={error}
          placeholder={placeholder}
          value={typeof value === 'string' ? value : ''}
          onValueChange={(text) => onChange(text === '' ? undefined : text)}
        />
      );
  }
}
