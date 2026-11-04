import type { LucideIcon } from 'lucide-react';
import { m } from '../paraglide/messages.js';

type TileProps = {
  icon: LucideIcon;
  label: string;
  state: string;
  /** Read by screen readers after the state, not shown: for a fact the icon alone carries (playing or paused). */
  status?: string;
  onPress: () => void;
  /** The action is running: the tile dims and ignores taps. */
  pending?: boolean;
  /** The last action failed: the state line gives way to an error until the next tap. */
  error?: boolean;
  /** The live connection is down: the state shown is the last one received, so the tile dims. */
  stale?: boolean;
};

export function Tile({
  icon: Icon,
  label,
  state,
  status,
  onPress,
  pending = false,
  error = false,
  stale = false,
}: TileProps) {
  const shownState = error ? m.tile_error() : state;
  return (
    <button
      type="button"
      aria-label={`${label}: ${shownState}${status ? `, ${status}` : ''}`}
      aria-busy={pending}
      disabled={pending}
      onClick={onPress}
      className={`flex flex-col items-start gap-xs rounded-lg border p-md text-left active:bg-surface-raised disabled:opacity-60 ${
        error ? 'border-danger' : 'border-border'
      } ${stale ? 'opacity-60' : ''} bg-surface`}
    >
      <Icon className="size-icon" aria-hidden />
      <span className="text-label">{label}</span>
      <span
        className={`line-clamp-2 self-stretch text-caption break-words tabular-nums ${error ? 'text-danger' : 'text-muted-foreground'}`}
      >
        {shownState}
      </span>
    </button>
  );
}
