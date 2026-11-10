import type { Icon, IconWeight } from '@phosphor-icons/react';
import { m } from '../paraglide/messages.js';

type TileProps = {
  icon: Icon;
  iconName?: string;
  iconWeight?: IconWeight;
  label: string;
  state: string;
  /** Read by screen readers after the state, not shown: for a fact the icon alone carries (playing or paused). */
  status?: string;
  /** Without it the tile only shows a state: a named group, not a button, so nothing pretends to be pressable. */
  onPress?: () => void;
  /** The action is running: the tile dims and ignores taps. */
  pending?: boolean;
  /** The action cannot run now (its target is unreachable): the tile dims and ignores taps. */
  disabled?: boolean;
  /** The last action failed: the state line gives way to an error until the next tap. */
  error?: boolean;
  /** The live connection is down: the state shown is the last one received, so the tile dims. */
  stale?: boolean;
  /** A count in the corner, like an app icon's. Decorative: say the number in `status` too. */
  badge?: number;
};

export function Tile({
  icon: Icon,
  iconName,
  iconWeight = 'regular',
  label,
  state,
  status,
  onPress,
  pending = false,
  disabled = false,
  error = false,
  stale = false,
  badge,
}: TileProps) {
  const shownState = error ? m.tile_error() : state;
  const name = `${label}: ${shownState}${status ? `, ${status}` : ''}`;
  const look = `relative flex flex-col items-start gap-xs rounded-lg border p-md text-left ${
    error ? 'border-danger' : 'border-border'
  } ${stale ? 'opacity-60' : ''} bg-surface`;
  const content = (
    <>
      <Icon className="size-icon" aria-hidden data-icon={iconName} data-weight={iconWeight} weight={iconWeight} />
      {badge !== undefined && (
        <span
          aria-hidden
          className="absolute top-sm right-sm flex min-w-icon items-center justify-center rounded-full bg-primary px-2xs text-caption text-primary-foreground tabular-nums"
        >
          {badge}
        </span>
      )}
      <span className="text-label">{label}</span>
      <span
        className={`line-clamp-2 self-stretch text-caption break-words tabular-nums ${error ? 'text-danger' : 'text-muted-foreground'}`}
      >
        {shownState}
      </span>
    </>
  );
  if (!onPress)
    return (
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- fieldset groups form controls; a status tile is a named group of text.
      <div role="group" aria-label={name} className={look}>
        {content}
      </div>
    );
  return (
    <button
      type="button"
      aria-label={name}
      aria-busy={pending}
      disabled={pending || disabled}
      onClick={onPress}
      className={`${look} active:bg-surface-raised disabled:opacity-60`}
    >
      {content}
    </button>
  );
}
