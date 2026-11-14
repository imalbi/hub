import { m } from '../../paraglide/messages.js';
import { useNotesUi } from './store.ts';
import { useNoteActions } from './use-notes.ts';

/** "Post-it staccato, Annulla": a pill at the bottom centre of the desk for a few seconds after Stacca. */
export function NoteUndoToast() {
  const { removed } = useNotesUi();
  const actions = useNoteActions();
  if (!removed) return null;
  return (
    <output className="fixed bottom-xl left-1/2 z-50 flex h-touch -translate-x-1/2 items-center gap-md rounded-full border border-border bg-surface-raised pr-xs pl-lg text-label">
      {m.notes_removed()}
      <button
        type="button"
        aria-label={m.notes_undo_named({ text: removed.text })}
        className="min-h-xl cursor-pointer rounded-full bg-foreground px-md text-caption font-medium text-background"
        onClick={() => void actions.restore(removed.id)}
      >
        {m.notes_undo()}
      </button>
    </output>
  );
}
