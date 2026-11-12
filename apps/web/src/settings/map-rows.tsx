import { XIcon } from '@phosphor-icons/react';
import { useId, useState } from 'react';
import { ActionButton } from '../components/ui/action-button.tsx';
import { Input } from '../components/ui/input.tsx';
import { StepperInput } from '../components/ui/stepper-input.tsx';
import { TagInput } from '../components/ui/tag-input.tsx';
import { m } from '../paraglide/messages.js';
import { tagCopy } from './field-copy.ts';
import { isObject } from './path.ts';

type Row = { id: number; key: string; number: number | undefined; words: string[] };
type Kind = 'number' | 'words';

const toRows = (value: unknown): Row[] =>
  Object.entries(isObject(value) ? value : {}).map(([key, entry], id) => ({
    id,
    key,
    number: typeof entry === 'number' ? entry : undefined,
    words: Array.isArray(entry) ? entry.filter((word): word is string => typeof word === 'string') : [],
  }));

/** The first problem that stops the rows from being a map: an empty key or one used twice. */
function problems(rows: Row[]): Map<number, string> {
  const found = new Map<number, string>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.key.trim() === '') found.set(row.id, m.settings_key_empty());
    else if (seen.has(row.key)) found.set(row.id, m.settings_key_duplicate({ key: row.key }));
    seen.add(row.key);
  }
  return found;
}

/**
 * A record as one "key + value" row per entry. The rows are this editor's own state (two rows may briefly share a key,
 * and a new one has none yet); only a set of rows that is a valid map reaches the draft, and `onBlock` says otherwise
 * so Salva waits instead of data being dropped. Remount it (a `key`) to start over from the draft.
 */
export function MapRows({
  name,
  kind,
  value,
  integer,
  onChange,
  onBlock,
}: {
  name: string;
  kind: Kind;
  value: unknown;
  integer: boolean;
  onChange: (value: unknown) => void;
  onBlock: (error: string | null) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const [next, setNext] = useState(() => rows.length);
  const uid = useId();

  const commit = (updated: Row[]) => {
    setRows(updated);
    const found = problems(updated);
    onBlock([...found.values()][0] ?? null);
    if (found.size > 0) return;
    onChange(
      updated.length === 0
        ? undefined
        : Object.fromEntries(updated.map((row) => [row.key, kind === 'number' ? (row.number ?? 0) : row.words])),
    );
  };
  const patch = (id: number, change: Partial<Row>) =>
    commit(rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  const errors = problems(rows);

  return (
    <div className="flex flex-col gap-sm">
      {rows.map((row, index) => {
        const error = errors.get(row.id);
        return (
          <div key={row.id} className="flex flex-col gap-2xs">
            <div className="flex items-start gap-sm">
              <div className="w-1/3 shrink-0">
                <Input
                  aria-label={m.settings_map_key({ name, n: index + 1 })}
                  value={row.key}
                  onValueChange={(key) => patch(row.id, { key })}
                />
              </div>
              <div className="min-w-0 grow">
                {kind === 'number' ? (
                  <StepperInput
                    label={m.settings_map_value({ name, n: index + 1 })}
                    decreaseLabel={m.settings_decrease({ name: row.key })}
                    increaseLabel={m.settings_increase({ name: row.key })}
                    step={integer ? 1 : 0.1}
                    value={row.number}
                    onValueChange={(number) => patch(row.id, { number })}
                  />
                ) : (
                  <TagInput
                    label={m.settings_map_value({ name, n: index + 1 })}
                    copy={tagCopy}
                    allowCreate
                    value={row.words.map((word) => ({ id: word, value: word }))}
                    onValueChange={(tags) =>
                      patch(row.id, { words: tags.filter((tag) => !tag.error).map((tag) => tag.value) })
                    }
                  />
                )}
              </div>
              <button
                type="button"
                aria-label={m.settings_remove({ name: row.key || String(index + 1) })}
                onClick={() => commit(rows.filter((other) => other.id !== row.id))}
                className="flex size-touch shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent"
              >
                <XIcon aria-hidden className="size-icon-sm" />
              </button>
            </div>
            {error && (
              <p id={`${uid}-${row.id}`} role="alert" className="pl-sm text-caption text-danger">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <ActionButton
        variant="outline"
        className="w-fit"
        aria-label={`${m.settings_add()}: ${name}`}
        onClick={() => {
          setNext(next + 1);
          commit([...rows, { id: next, key: '', number: 0, words: [] }]);
        }}
      >
        {m.settings_add()}
      </ActionButton>
    </div>
  );
}
