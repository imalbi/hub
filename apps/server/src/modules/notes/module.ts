import { defineModule } from '../../core/module.ts';
import { createNotes } from './notes.ts';
import { createNotesRouter } from './router.ts';

export const notesModule = defineModule({
  name: 'notes',
  coreDb: true,
  create({ db }) {
    return { router: createNotesRouter(createNotes(db)) };
  },
});
