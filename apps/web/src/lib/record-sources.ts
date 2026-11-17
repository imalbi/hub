import { createContext } from 'react';
import type { RecordSource } from './module-ui.ts';

export const RecordSourcesContext = createContext<RecordSource[]>([]);
