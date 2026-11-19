import { TextMorph } from './ui/text-morph.tsx';

/**
 * A pill that opens one or more actions and merges back when closed, as in the owner's marked reference ("Confirm and
 * cancel buttons that morph"): the extra actions grow out of the main pill's left edge, their labels sharpening from a
 * blur, and the main label morphs letter by letter. Extra buttons stay mounted (inert) so they can animate out.
 */
export function SplitPill({
  open,
  label,
  onClick,
  actions,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
  actions: { label: string; onClick: () => void; disabled?: boolean }[];
}) {
  return (
    <div className="split-pill flex items-center" data-open={open || undefined}>
      {actions.map((action) => (
        <span key={action.label} className="split-pill-extra" inert={!open} aria-hidden={!open}>
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className="min-h-touch rounded-full border border-border px-md text-label whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent disabled:opacity-40"
          >
            {action.label}
          </button>
        </span>
      ))}
      <button
        type="button"
        aria-label={label}
        data-open={open || undefined}
        onClick={onClick}
        className="min-h-touch rounded-full border border-border px-lg text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent data-open:bg-primary data-open:text-primary-foreground"
      >
        <TextMorph aria-hidden>{label}</TextMorph>
      </button>
    </div>
  );
}
