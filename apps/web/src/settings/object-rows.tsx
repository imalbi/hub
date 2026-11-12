import { XIcon } from '@phosphor-icons/react';
import { ActionButton } from '../components/ui/action-button.tsx';
import { Input } from '../components/ui/input.tsx';
import { Select } from '../components/ui/select.tsx';
import { StepperInput } from '../components/ui/stepper-input.tsx';
import { Switch } from '../components/ui/switch.tsx';
import { m } from '../paraglide/messages.js';
import { isObject } from './path.ts';
import type { Column } from './schema-fields.ts';

type Item = Record<string, unknown>;

/** A list of flat objects as a compact table: one row per item, one cell per column, no visible label per cell. */
export function ObjectRows({
  name,
  columns,
  value,
  onChange,
}: {
  name: string;
  columns: readonly Column[];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const items: Item[] = Array.isArray(value) ? value.filter(isObject) : [];
  const cols = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) var(--spacing-touch)` };
  const setCell = (index: number, key: string, cell: unknown) =>
    onChange(
      items.map((item, at) => {
        if (at !== index) return item;
        const { [key]: _old, ...rest } = item;
        return cell === undefined ? rest : { ...rest, [key]: cell };
      }),
    );

  return (
    <div className="flex flex-col gap-sm">
      {items.length > 0 && (
        <div className="grid items-end gap-x-sm" style={cols}>
          {columns.map((column) => (
            <span key={column.path.join()} className="pl-sm text-caption text-muted-foreground">
              {column.label}
            </span>
          ))}
          <span aria-hidden />
        </div>
      )}
      {items.map((item, index) => (
        // The list has no ids, so the position is the identity of a row.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index} className="grid items-center gap-x-sm" style={cols}>
          {columns.map((column) => {
            const [key] = column.path;
            const cell = key === undefined ? undefined : item[key];
            const aria = m.settings_row_cell({ column: column.label, n: index + 1 });
            const set = (next: unknown) => {
              if (key !== undefined) setCell(index, key, next);
            };
            return (
              <div key={column.path.join()} className="min-w-0">
                {column.kind === 'number' ? (
                  <StepperInput
                    label={aria}
                    decreaseLabel={m.settings_decrease({ name: aria })}
                    increaseLabel={m.settings_increase({ name: aria })}
                    step={column.integer ? 1 : 0.1}
                    min={column.min}
                    max={column.max}
                    value={typeof cell === 'number' ? cell : undefined}
                    onValueChange={set}
                  />
                ) : column.kind === 'boolean' ? (
                  <Switch aria-label={aria} checked={cell === true} onCheckedChange={set} />
                ) : column.kind === 'choice' ? (
                  <Select
                    hideLabel
                    label={aria}
                    value={typeof cell === 'string' || typeof cell === 'number' ? String(cell) : null}
                    options={column.options.map((option) => ({ value: String(option.value), label: option.label }))}
                    onValueChange={(next) => set(column.options.find((option) => String(option.value) === next)?.value)}
                  />
                ) : (
                  <Input
                    aria-label={aria}
                    value={typeof cell === 'string' ? cell : ''}
                    onValueChange={(text) => set(text === '' ? undefined : text)}
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            aria-label={m.settings_remove_row({ n: index + 1 })}
            onClick={() => onChange(items.filter((_, at) => at !== index))}
            className="flex size-touch items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent"
          >
            <XIcon aria-hidden className="size-icon-sm" />
          </button>
        </div>
      ))}
      <ActionButton
        variant="outline"
        className="w-fit"
        aria-label={`${m.settings_add()}: ${name}`}
        onClick={() => onChange([...items, {}])}
      >
        {m.settings_add()}
      </ActionButton>
    </div>
  );
}
