import { useId } from 'react';
import { NoteIcon, PlusIcon } from '@phosphor-icons/react';
import { AnimatedRow, AnimatedRows } from '../../components/animated-list.tsx';
import { Panel } from '../../components/panel.tsx';
import { EmptyState } from '../../components/ui/empty-state.tsx';
import { Kbd } from '../../components/ui/kbd.tsx';
import { localDay } from '../../lib/day.ts';
import { useNow } from '../../lib/use-now.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { AboutLink } from './about-link.tsx';
import { NoteCard } from './card.tsx';
import { groupBoardNotes, nearestNotes, noteDayLabel, splitNotes, type Note } from './days.ts';
import { openCapture } from './store.ts';
import { useNoteActions, useNotes } from './use-notes.ts';

/** Panoramica widget: Medio shows the next 3 cards, Grande a 3-column day board, and Largo/Esteso the full editable grid. */
export function NotesWidget({ size }: { size: WidgetSize }) {
  const boardId = useId();
  const notes = useNotes().data;
  const today = localDay(new Date(useNow('clock')));

  if (size === 'wide' || size === 'full') {
    const { due, upcoming } = splitNotes(notes ?? [], today);
    return (
      <Panel
        title={m.notes_title()}
        className="h-full"
        action={
          <button
            type="button"
            onClick={() => openCapture()}
            className="flex min-h-xl cursor-pointer items-center gap-xs rounded-full border border-border px-md text-label hover:bg-muted"
          >
            <PlusIcon className="size-icon-xs" aria-hidden />
            {m.notes_add()}
          </button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto">
          {notes && !notes.length && (
            <EmptyState
              variant="compact"
              icon={<NoteIcon className="size-icon-lg" aria-hidden="true" />}
              title={m.notes_empty()}
            />
          )}
          <ul className="notes-presence-list grid grid-cols-3 gap-sm">
            <AnimatedRows>
              {due
                .toSorted((a, b) => b.createdAt - a.createdAt)
                .map((note) => (
                  <NoteCard key={note.id} note={note} />
                ))}
            </AnimatedRows>
          </ul>
          <section aria-label={m.notes_upcoming()} className="notes-presence-section flex flex-col gap-xs">
            <h3 className="text-label text-muted-foreground">{m.notes_upcoming()}</h3>
            <ul className="grid grid-cols-3 gap-sm">
              <AnimatedRows>
                {upcoming.map((note) => (
                  <NoteCard key={note.id} note={note} today={today} />
                ))}
              </AnimatedRows>
            </ul>
          </section>
        </div>
      </Panel>
    );
  }

  const headerAction = (
    <div className="flex items-center gap-xs tracking-normal normal-case">
      <Kbd>N</Kbd>
      <button
        type="button"
        onClick={() => openCapture()}
        className="flex min-h-xl cursor-pointer items-center rounded-full border border-border px-md text-label hover:bg-muted focus-visible:outline focus-visible:outline-accent"
      >
        {m.notes_add()}
      </button>
    </div>
  );

  if (notes === undefined) {
    return (
      <Panel title={m.notes_title()} className="h-full" action={headerAction}>
        {null}
      </Panel>
    );
  }

  if (notes.length === 0) {
    return (
      <Panel title={m.notes_title()} className="h-full" action={headerAction}>
        <EmptyState
          variant="compact"
          icon={<NoteIcon className="size-icon-lg" aria-hidden="true" />}
          title={m.notes_empty()}
          className="m-auto"
        />
      </Panel>
    );
  }

  const words = { today: m.notes_today(), tomorrow: m.notes_tomorrow() };

  if (size === 'medium') {
    const shown = nearestNotes(notes, today);
    return (
      <Panel title={m.notes_title()} className="h-full" action={headerAction}>
        <ul className="mt-auto grid min-w-0 grid-cols-3 gap-sm">
          <AnimatedRows>
            {shown.map((note) => (
              <CompactNoteCard key={note.id} note={note} dayLabel={noteDayLabel(note.forDay, today, words)} />
            ))}
          </AnimatedRows>
        </ul>
      </Panel>
    );
  }

  const board = groupBoardNotes(notes, today);
  const columns = [
    { id: 'today', heading: m.notes_today(), items: board.today, showDay: false },
    { id: 'tomorrow', heading: m.notes_tomorrow(), items: board.tomorrow, showDay: false },
    { id: 'later', heading: m.notes_later(), items: board.later, showDay: true },
  ] as const;

  return (
    <Panel title={m.notes_title()} className="h-full" action={headerAction}>
      <div className="flex min-h-0 flex-1 flex-col gap-sm">
        <div className="grid min-h-0 flex-1 grid-cols-3 items-start gap-sm">
          {columns.map((column) => (
            <section
              key={column.id}
              aria-labelledby={`${boardId}-${column.id}`}
              className="flex min-h-0 min-w-0 flex-col gap-xs"
            >
              <h3 id={`${boardId}-${column.id}`} className="text-label text-muted-foreground">
                {column.heading}
              </h3>
              <ul className="flex min-w-0 flex-col gap-xs">
                <AnimatedRows>
                  {column.items.map((note) => (
                    <CompactNoteCard
                      key={note.id}
                      note={note}
                      dayLabel={column.showDay ? noteDayLabel(note.forDay, today, words) : undefined}
                    />
                  ))}
                </AnimatedRows>
              </ul>
            </section>
          ))}
        </div>
        {board.remaining > 0 && (
          <p className="mt-auto truncate text-label text-muted-foreground tabular-nums">
            {m.notes_more_items({ count: board.remaining })}
          </p>
        )}
      </div>
    </Panel>
  );
}

function CompactNoteCard({ note, dayLabel }: { note: Note; dayLabel?: string }) {
  const actions = useNoteActions();
  return (
    <AnimatedRow className="group relative flex min-w-0 flex-col gap-3xs rounded-md bg-muted px-md py-sm">
      {dayLabel !== undefined ? (
        <div className="flex min-w-0 items-center justify-between gap-xs">
          <p className="truncate text-caption text-muted-foreground">{dayLabel}</p>
          <RemoveButton note={note} onRemove={() => void actions.remove(note)} />
        </div>
      ) : (
        <RemoveButton note={note} onRemove={() => void actions.remove(note)} className="absolute top-xs right-xs" />
      )}
      <p className="line-clamp-2 text-body break-words" title={note.text}>
        {note.text}
        {note.about && (
          <>
            {' · '}
            <AboutLink about={note.about} />
          </>
        )}
      </p>
    </AnimatedRow>
  );
}

function RemoveButton({ note, onRemove, className = '' }: { note: Note; onRemove: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={m.notes_remove_named({ text: note.text })}
      onClick={onRemove}
      className={`cursor-pointer rounded-full border border-border bg-surface px-sm text-caption text-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted focus-visible:outline focus-visible:outline-accent ${className}`}
    >
      {m.notes_remove()}
    </button>
  );
}
