import { useState } from 'react';
import { m } from '../../paraglide/messages.js';
import { agentName, laterDay, type Note } from './days.ts';
import { useNoteActions } from './use-notes.ts';

const quietButton = 'cursor-pointer rounded-full text-foreground';

/** One post-it of the widget: a raised card whose text edits in place. `today` set means it is for a later day (dashed card). */
export function NoteCard({ note, today }: { note: Note; today?: string }) {
  const actions = useNoteActions();
  const [draft, setDraft] = useState<string | null>(null);
  const agent = agentName(note);
  const label = [today ? laterDay(note.forDay, today) : null, agent ? m.notes_by_agent({ name: agent }) : null]
    .filter(Boolean)
    .join(', ');
  async function save() {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== note.text) await actions.edit(note, next);
  }
  return (
    <li
      className={`group flex min-h-note min-w-0 flex-col justify-between gap-sm rounded-md px-md py-sm ${today ? 'border border-dashed border-border' : 'bg-muted'} ${draft === null ? '' : 'ring-2 ring-accent'}`}
    >
      {draft === null ? (
        <button
          type="button"
          aria-label={m.notes_edit({ text: note.text })}
          onClick={() => setDraft(note.text)}
          className="cursor-text text-left text-body break-words whitespace-pre-wrap"
        >
          {note.text}
        </button>
      ) : (
        <textarea
          ref={(element) => element?.focus()}
          aria-label={m.notes_text()}
          maxLength={280}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setDraft(null);
            } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save();
            }
          }}
          className="w-full resize-none bg-transparent text-body outline-none"
        />
      )}
      <div className="flex min-h-xl items-center justify-between gap-sm">
        <p className="text-caption text-muted-foreground">{draft === null ? label : m.notes_edit_hint()}</p>
        {draft === null && (
          <button
            type="button"
            aria-label={m.notes_remove_named({ text: note.text })}
            onClick={() => void actions.remove(note)}
            className={`${quietButton} bg-border px-sm text-caption opacity-0 group-focus-within:opacity-100 group-hover:opacity-100`}
          >
            {m.notes_remove()}
          </button>
        )}
      </div>
    </li>
  );
}
