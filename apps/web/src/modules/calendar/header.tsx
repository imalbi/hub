import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { ButtonGroup } from '../../components/ui/button-group.tsx';
import { m } from '../../paraglide/messages.js';
import type { View } from './view-state.ts';

const roundButton =
  'flex size-touch cursor-pointer items-center justify-center rounded-full border border-border text-foreground hover:bg-muted';

export type Controls = { view: View; onView: (view: View) => void; onNew: () => void };

/** Mese / Settimana / Agenda: the choice is remembered by the page. */
export function ViewSwitch({ view, onView }: Pick<Controls, 'view' | 'onView'>) {
  return (
    <ButtonGroup
      label={m.calendar_view()}
      collapseLabels={false}
      size="sm"
      items={[
        { id: 'month', label: m.calendar_view_month(), active: view === 'month', onClick: () => onView('month') },
        { id: 'week', label: m.calendar_view_week(), active: view === 'week', onClick: () => onView('week') },
        { id: 'agenda', label: m.calendar_view_agenda(), active: view === 'agenda', onClick: () => onView('agenda') },
      ]}
    />
  );
}

export function NewEventButton({ onNew }: Pick<Controls, 'onNew'>) {
  return (
    <button
      type="button"
      onClick={onNew}
      className="min-h-touch shrink-0 cursor-pointer rounded-full bg-foreground px-lg text-label font-medium whitespace-nowrap text-background"
    >
      {m.calendar_new()}
    </button>
  );
}

/** Title, previous, next and Oggi on the left; the view switch and Nuovo evento on the right (Mese and Settimana). */
export function NavHeader({
  title,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onToday,
  controls,
}: {
  title: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  controls: Controls;
}) {
  return (
    <div className="flex items-center gap-sm">
      <h2 className="text-title whitespace-nowrap">{title}</h2>
      <button type="button" aria-label={previousLabel} onClick={onPrevious} className={roundButton}>
        <CaretLeftIcon className="size-icon-sm" aria-hidden />
      </button>
      <button type="button" aria-label={nextLabel} onClick={onNext} className={roundButton}>
        <CaretRightIcon className="size-icon-sm" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onToday}
        className="min-h-touch cursor-pointer rounded-full border border-border px-md text-label hover:bg-muted"
      >
        {m.calendar_today()}
      </button>
      <div className="flex-1" />
      <ViewSwitch view={controls.view} onView={controls.onView} />
      <NewEventButton onNew={controls.onNew} />
    </div>
  );
}
