import { useLayoutEffect, useRef, useState } from 'react';
import { HoldButton } from '../components/hold-button.tsx';
import { Select } from '../components/ui/select.tsx';
import { m } from '../paraglide/messages.js';
import { paletteFields, type RegistryAction } from './palette-input.ts';

type Field = NonNullable<ReturnType<typeof paletteFields>>[number];

/** Booleans and enums are picked from a list; everything else is typed. */
const isChoice = ({ schema }: Field) => schema.type === 'boolean' || schema.enum !== undefined;

function choiceOptions({ schema }: Field) {
  return (schema.type === 'boolean' ? [true, false] : (schema.enum ?? [])).map((value) => ({
    value: String(value),
    label: value === true ? m.palette_yes() : value === false ? m.palette_no() : String(value),
  }));
}

export function PaletteForm({ action, run }: { action: RegistryAction; run: (input: unknown) => Promise<unknown> }) {
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const target = form.current?.querySelector<HTMLElement>('input, select, button') ?? heading.current;
    target?.focus();
  }, []);
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  // A Select has no form value of its own, so the picks live here.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const fields = paletteFields(action.schema, action.danger);
  if (fields === null)
    return (
      <div className="flex flex-col gap-md">
        <h2 ref={heading} tabIndex={-1} className="text-title">
          {action.label}
        </h2>
        <p className="text-body text-muted-foreground">{m.palette_unsupported()}</p>
      </div>
    );
  async function submit() {
    if (!form.current?.reportValidity() || !fields) throw new Error('Invalid input');
    if (fields.some((field) => field.required && isChoice(field) && !picked[field.name])) {
      setMissing(true);
      throw new Error('Invalid input');
    }
    const values = new FormData(form.current);
    const input: Record<string, unknown> = {};
    for (const field of fields) {
      const { name, schema } = field;
      const value = isChoice(field) ? picked[name] : values.get(name);
      if (typeof value !== 'string' || value === '') continue;
      input[name] =
        schema.type === 'boolean'
          ? value === 'true'
          : schema.type === 'number' || schema.type === 'integer'
            ? Number(value)
            : value;
    }
    if (action.danger) input.confirmed = true;
    setStatus('pending');
    try {
      await run(input);
      setStatus('success');
    } catch {
      setStatus('error');
      throw new Error('Action failed');
    }
  }
  return (
    <form
      ref={form}
      className="flex flex-col gap-md"
      onSubmit={(event) => {
        event.preventDefault();
        if (!action.danger && status !== 'pending') void submit().catch(() => {});
      }}
    >
      <h2 className="text-title">{action.label}</h2>
      {fields.map((field) => {
        const { name, required, schema } = field;
        return isChoice(field) ? (
          <Select
            key={name}
            label={name}
            options={choiceOptions(field)}
            placeholder={m.palette_select()}
            value={picked[name] ?? null}
            onValueChange={(value) => setPicked((current) => ({ ...current, [name]: value }))}
            disabled={status === 'pending'}
            error={missing && required && !picked[name] ? m.palette_required() : undefined}
          />
        ) : (
          <label key={name} className="flex flex-col gap-xs text-label">
            {name}
            <input
              name={name}
              type={schema.type === 'string' ? 'text' : 'number'}
              required={required}
              disabled={status === 'pending'}
              min={schema.minimum}
              max={schema.maximum}
              step={schema.type === 'integer' ? 1 : (schema.multipleOf ?? 'any')}
              minLength={schema.minLength}
              maxLength={schema.maxLength}
              pattern={schema.pattern}
              className="min-h-touch rounded-md border border-border bg-background px-sm text-body"
            />
          </label>
        );
      })}
      {action.danger ? (
        <HoldButton
          label={m.palette_hold({ label: action.label })}
          idle={action.label}
          done={m.action_done()}
          onConfirm={submit}
        />
      ) : (
        <button
          type="submit"
          disabled={status === 'pending'}
          className="min-h-touch rounded-full bg-primary px-md text-label text-primary-foreground disabled:opacity-60"
        >
          {status === 'pending' ? m.action_pending() : m.palette_run()}
        </button>
      )}
      <output className="text-caption text-muted-foreground">
        {status === 'success' ? m.action_done() : status === 'error' ? m.palette_error() : ''}
      </output>
    </form>
  );
}
