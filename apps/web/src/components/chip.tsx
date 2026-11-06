import { XIcon } from '@phosphor-icons/react';
import { m } from '../paraglide/messages.js';
import { Badge } from './ui/badge.tsx';

/** A removable tag, such as an active filter: the label as a Badge and a button that drops it. */
export function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    // The Badge puts its icon slot before the text, so the row is reversed to end on the button.
    <Badge icon={<RemoveButton label={label} onRemove={onRemove} />} className="flex-row-reverse pr-3xs">
      {label}
    </Badge>
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={m.chip_remove({ name: label })}
      onClick={onRemove}
      onKeyDown={(e) => {
        if (e.key !== 'Backspace' && e.key !== 'Delete') return;
        e.preventDefault();
        onRemove();
      }}
      className="flex size-icon shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <XIcon aria-hidden="true" />
    </button>
  );
}
