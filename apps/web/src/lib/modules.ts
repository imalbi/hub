import type { ModuleUI } from './module-ui.ts';

// The only web import point for private source; Vite resolves a disposable root during tests.
const local = import.meta.glob<{ default: ModuleUI }>('@hub-private-modules/*/ui.tsx', { eager: true });
const examples =
  import.meta.env.HUB_EXAMPLE_MODULES === '1'
    ? import.meta.glob<{ default: ModuleUI }>('../../../../modules.example/*/ui.tsx', { eager: true })
    : {};
export const moduleUIs = [...Object.values(local), ...Object.values(examples)].map((module) => module.default);
