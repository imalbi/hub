import { CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Panel } from '../components/panel.tsx';
import { m } from '../paraglide/messages.js';
import { JsonBlock } from './json-block.tsx';
import { getAt, startsWith } from './path.ts';
import type { Block, Path } from './schema-fields.ts';

type Issue = { path: Path; message: string };

/** The parts with no simple control, one disclosure each; closed ones stay mounted so a half-typed text is kept. */
export function AdvancedPanel({
  blocks,
  value,
  issues,
  resetCount,
  idKey,
  onChange,
}: {
  blocks: readonly Block[];
  value: unknown;
  issues: readonly Issue[];
  resetCount: number;
  idKey: (path: Path) => string;
  onChange: (block: Block, next: unknown, error: string | null) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  return (
    <Panel title={m.settings_advanced()}>
      <ul className="flex flex-col gap-md">
        {blocks.map((block) => {
          const id = idKey(block.path);
          const isOpen = open.has(id);
          const panelId = `block-${resetCount}-${id}`.replace(/\W/g, '-');
          return (
            <li key={id} className="flex min-w-0 flex-col gap-sm">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => {
                  const next = new Set(open);
                  if (isOpen) next.delete(id);
                  else next.add(id);
                  setOpen(next);
                }}
                className="flex min-h-touch w-full items-center gap-sm rounded-md text-left focus-visible:outline focus-visible:outline-accent"
              >
                <CaretRightIcon
                  aria-hidden
                  className={`size-icon-sm shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-label text-foreground">{block.label}</span>
                  {block.description && <span className="text-caption text-muted-foreground">{block.description}</span>}
                </span>
              </button>
              <div id={panelId} hidden={!isOpen} className="min-w-0">
                <JsonBlock
                  key={`${id}-${resetCount}`}
                  label={block.label}
                  value={getAt(value, block.path)}
                  issues={issues
                    .filter((issue) => startsWith(issue.path, block.path))
                    .map((issue) => ({ path: issue.path.slice(block.path.length), message: issue.message }))}
                  onChange={(next, error) => onChange(block, next, error)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
