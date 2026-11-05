import { useLayoutEffect, useRef, useState } from 'react';
import { HoldButton } from '../components/hold-button.tsx';
import { m } from '../paraglide/messages.js';
import { paletteFields, type RegistryAction } from './palette-input.ts';

export function PaletteForm({ action, run }: { action: RegistryAction; run: (input: unknown) => Promise<unknown> }) {
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const target = form.current?.querySelector<HTMLElement>('input, select, button') ?? heading.current;
    target?.focus();
  }, []);
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
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
    const values = new FormData(form.current);
    const input: Record<string, unknown> = {};
    for (const { name, schema } of fields) {
      const value = values.get(name);
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
      {fields.map(({ name, required, schema }) => (
        <label key={name} className="flex flex-col gap-xs text-label">
          {name}
          {schema.type === 'boolean' || schema.enum ? (
            <select
              name={name}
              required={required}
              disabled={status === 'pending'}
              defaultValue=""
              className="min-h-touch rounded-md border border-border bg-background px-sm text-body"
            >
              <option value="">{m.palette_select()}</option>
              {(schema.type === 'boolean' ? [true, false] : (schema.enum ?? [])).map((value) => (
                <option key={String(value)} value={String(value)}>
                  {value === true ? m.palette_yes() : value === false ? m.palette_no() : String(value)}
                </option>
              ))}
            </select>
          ) : (
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
          )}
        </label>
      ))}
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
