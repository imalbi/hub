import { TextMorph } from './ui/text-morph.tsx';

/**
 * A pill that splits in two when `open` and merges back when closed, as in the owner's marked reference ("Confirm and
 * cancel buttons that morph"): the extra action grows out of the main pill's left edge, its label sharpening from a
 * blur, and the main label morphs letter by letter. The extra button stays mounted (inert) so it can animate out.
 */
export function SplitPill({
  open,
  label,
  onClick,
  extraLabel,
  onExtra,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
  extraLabel: string;
  onExtra: () => void;
}) {
  return (
    <div className="split-pill flex items-center" data-open={open || undefined}>
      <span className="split-pill-extra" inert={!open}>
        <button
          type="button"
          onClick={onExtra}
          className="min-h-touch rounded-full border border-border px-md text-label whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-accent"
        >
          {extraLabel}
        </button>
      </span>
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
