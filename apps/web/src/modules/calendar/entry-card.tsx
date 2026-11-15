import type { DayEntry } from './days.ts';
import { metaLine } from './kinds.ts';

// Cards of the week: the module's colour language, as in the month's chips (work filled, own and shifts outlined, post-its italic).
const cardStyle: Record<DayEntry['kind'], string> = {
  work: 'bg-accent text-background',
  event: 'border border-foreground/25',
  shift: 'border border-foreground/25',
  note: 'bg-foreground/15 italic',
  study: 'bg-foreground/10',
};

/** One item as a card: muted "when · kind" line, then its title. An own event or a linked item is a button. */
export function EntryCard({ entry, onOpen }: { entry: DayEntry; onOpen: (entry: DayEntry) => void }) {
  const tone = entry.kind === 'work' ? 'text-background/70' : 'text-muted-foreground';
  const lines = (
    <>
      <span className={`text-caption ${tone}`}>{metaLine(entry)}</span>
      <span className="text-label font-normal">{entry.title}</span>
    </>
  );
  const card = `flex w-full flex-col gap-3xs rounded-md px-sm py-xs text-left ${cardStyle[entry.kind]}`;
  return entry.own || entry.href ? (
    <button type="button" onClick={() => onOpen(entry)} className={`${card} cursor-pointer`}>
      {lines}
    </button>
  ) : (
    <div className={card}>{lines}</div>
  );
}
