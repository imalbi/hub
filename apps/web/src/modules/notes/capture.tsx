import { CalendarBlankIcon } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { MODAL_ROOT, SCRIM, useModal } from '../../components/ui/modal.ts';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { addDays, laterDay, localDay } from './days.ts';
import { closeCapture, useNotesUi } from './store.ts';

type When = 'today' | 'tomorrow' | 'other';

// Late in the day a note is almost always for the next one.
const EVENING_HOUR = 18;
const EXIT_MS = 220;

/** The card to type a post-it in: Invio saves, Esc closes. Mounted once by the desk shell. */
export function NoteCapture() {
  const { capturing } = useNotesUi();
  const { dialog, mounted, shown } = useModal(capturing, closeCapture, EXIT_MS);
  if (!mounted) return null;
  return (
    <dialog ref={dialog} aria-label={m.notes_new()} className={MODAL_ROOT}>
      <div
        role="presentation"
        className={SCRIM}
        onClick={closeCapture}
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${EXIT_MS}ms ease-out` }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-lg">
        <div
          data-modal-panel=""
          tabIndex={-1}
          className="pointer-events-auto w-full max-w-dialog-sm rounded-lg border border-border bg-surface p-lg shadow-lg outline-none"
          style={{ opacity: shown ? 1 : 0, transition: `opacity ${EXIT_MS}ms ease-out` }}
        >
          <CaptureForm />
        </div>
      </div>
    </dialog>
  );
}

// Its own component so the draft starts fresh every time the dialog mounts.
function CaptureForm() {
  const trpc = useTRPC();
  const add = useMutation(trpc.notes.add.mutationOptions());
  const picker = useRef<HTMLInputElement>(null);
  const [today] = useState(() => localDay(new Date()));
  const [text, setText] = useState('');
  const [when, setWhen] = useState<When>(() => (new Date().getHours() >= EVENING_HOUR ? 'tomorrow' : 'today'));
  const [picked, setPicked] = useState(() => addDays(today, 2));
  const day = when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : picked;
  const ready = text.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day);

  async function save() {
    if (!ready || add.isPending) return;
    try {
      await add.mutateAsync({ text, forDay: day });
      closeCapture();
    } catch {
      // The error line below says it; the draft stays.
    }
  }
  const segment = (active: boolean) =>
    `flex min-h-xl cursor-pointer items-center justify-center rounded-full px-md text-label ${active ? 'bg-foreground font-medium text-background' : 'text-foreground'}`;
  return (
    <div className="flex flex-col gap-md">
      <label className="flex flex-col gap-xs">
        <span className="text-label text-muted-foreground">{m.notes_new()}</span>
        <textarea
          data-initial-focus=""
          aria-label={m.notes_text()}
          rows={3}
          maxLength={280}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save();
            }
          }}
          className="resize-none rounded-md bg-muted px-md py-sm text-body outline-2 outline-transparent focus:outline-accent"
        />
      </label>
      <div className="flex items-center justify-between gap-md">
        <fieldset className="flex gap-2xs rounded-full border border-border p-2xs">
          <legend className="sr-only">{m.notes_for()}</legend>
          <button
            type="button"

            aria-pressed={when === 'today'}
            className={segment(when === 'today')}
            onClick={() => setWhen('today')}
          >
            {m.notes_today()}
          </button>
          <button
            type="button"

            aria-pressed={when === 'tomorrow'}
            className={segment(when === 'tomorrow')}
            onClick={() => setWhen('tomorrow')}
          >
            {m.notes_tomorrow()}
          </button>
          <button
            type="button"

            aria-pressed={when === 'other'}
            aria-label={when === 'other' ? undefined : m.notes_pick_day()}
            className={segment(when === 'other')}
            onClick={() => {
              setWhen('other');
              picker.current?.showPicker();
            }}
          >
            {when === 'other' ? (
              laterDay(picked, today, true)
            ) : (
              <CalendarBlankIcon className="size-icon-sm" aria-hidden />
            )}
          </button>
          {/* The browser's own calendar, opened by the button above; the input itself stays out of sight. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-label={m.notes_day()}
            className="sr-only"
            value={picked}
            min={today}
            onChange={(event) => {
              if (!event.target.value) return;
              setPicked(event.target.value);
              setWhen('other');
            }}
          />
        </fieldset>
        <p className="text-caption text-muted-foreground">{m.notes_save_hint()}</p>
      </div>
      {add.isError && (
        <p role="alert" className="text-caption text-danger">
          {m.notes_error()}
        </p>
      )}
    </div>
  );
}
