import { m } from '../paraglide/messages.js';
import type { ModuleUI } from './module-ui.ts';
import { CalendarDotsIcon } from '@phosphor-icons/react';
import { CalendarWidgetSlot, CalendarZone } from '../modules/calendar/zone.tsx';
import { useCalendarTodayLines } from '../modules/calendar/today.tsx';
import { useNotesCalendarItems } from '../modules/notes/calendar.ts';
import { NotesColumn } from '../modules/notes/today.tsx';
import { NotesWidget } from '../modules/notes/widget.tsx';

// The only web import points for private/installed module source; Vite resolves disposable roots during tests.
const local = import.meta.glob<{ default: ModuleUI }>('@hub-private-modules/*/ui.tsx', { eager: true });
const installed = import.meta.glob<{ default: ModuleUI }>('@hub-installed-modules/*/ui.tsx', { eager: true });
const examples =
  import.meta.env.HUB_EXAMPLE_MODULES === '1'
    ? import.meta.glob<{ default: ModuleUI }>('../../../../modules.example/*/ui.tsx', { eager: true })
    : {};
const localModules = Object.values(local).map((module) => module.default);
const localNames = new Set(localModules.map((module) => module.name));
const installedModules = Object.values(installed)
  .map((module) => module.default)
  .filter((module) => !localNames.has(module.name));
const exampleModules = Object.values(examples).map((module) => module.default);
export const moduleUIs: ModuleUI[] = [
  {
    name: 'notes',
    copy: {},
    todayColumn: NotesColumn,
    calendarItems: useNotesCalendarItems,
    widgets: [
      { id: 'notes', label: m.notes_title, sizes: ['medium', 'large', 'wide', 'full'], component: NotesWidget },
    ],
  },
  {
    name: 'calendar',
    copy: {},
    todayItems: useCalendarTodayLines,
    zone: { id: 'calendar', label: m.calendar_title, icon: CalendarDotsIcon, page: CalendarZone, fill: true },
    widgets: [
      { id: 'calendar', label: m.calendar_title, sizes: ['small', 'medium', 'large'], component: CalendarWidgetSlot },
    ],
  },
  ...localModules,
  ...installedModules,
  ...exampleModules,
];
