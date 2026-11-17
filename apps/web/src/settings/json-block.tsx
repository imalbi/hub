import { CheckIcon, WarningIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Textarea } from '../components/ui/textarea.tsx';
import { m } from '../paraglide/messages.js';
import type { Path } from './schema-fields.ts';

type Parsed = { ok: true; value: unknown } | { ok: false; message: string };

function parse(text: string): Parsed {
  if (text.trim() === '') return { ok: true, value: undefined };
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One nested part of the config as JSON. The text is the block's own state, so half-typed JSON stays; only a text that
 * parses reaches the form's value, and the page is told when it does not so Salva can wait.
 */
export function JsonBlock({
  label,
  value,
  issues,
  onChange,
}: {
  label: string;
  value: unknown;
  /** The schema's messages for this part, as the server answered them, with their path inside the part. */
  issues: { path: Path; message: string }[];
  /** `error` is set while the text is not valid JSON; the value is then left as it was. */
  onChange: (value: unknown, error: string | null) => void;
}) {
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const parsed = parse(text);
  return (
    <div className="flex flex-col gap-sm">
      <Textarea
        aria-label={m.settings_json_label({ name: label })}
        value={text}
        minRows={8}
        maxRows={40}
        spellCheck={false}
        textareaClassName="text-code"
        error={parsed.ok ? undefined : m.settings_json_invalid({ message: parsed.message })}
        onValueChange={(next) => {
          setText(next);
          const result = parse(next);
          onChange(result.ok ? result.value : undefined, result.ok ? null : result.message);
        }}
      />
      {parsed.ok && issues.length === 0 && (
        <p className="flex items-center gap-xs text-label text-success">
          <CheckIcon aria-hidden className="size-icon-sm" />
          {m.settings_json_valid()}
        </p>
      )}
      {parsed.ok && issues.length > 0 && (
        <ul className="flex flex-col gap-2xs">
          {issues.map(({ path, message }) => (
            <li key={`${path.join('.')}${message}`} className="flex items-start gap-xs text-label text-danger">
              <WarningIcon aria-hidden className="mt-3xs size-icon-sm shrink-0" />
              {path.length > 0
                ? m.settings_issue({ path: path.join('.'), message })
                : m.settings_issue_root({ message })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
