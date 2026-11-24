import type { ModuleUI } from './module-ui.ts';
import { m } from '../paraglide/messages.js';
import { CalendarDotsIcon } from '@phosphor-icons/react';
import { CalendarWidgetSlot, CalendarZone } from '../modules/calendar/zone.tsx';
import { useCalendarTodayLines } from '../modules/calendar/today.tsx';
import { studyDays } from '../modules/study/records.ts';
import { useStudyDaySummary, useStudyTodayLines } from '../modules/study/today-line.ts';
import { useNotesCalendarItems } from '../modules/notes/calendar.ts';
import { NotesColumn } from '../modules/notes/today.tsx';
import { NotesWidget } from '../modules/notes/widget.tsx';
import { StudyLibrary } from '../modules/study/library.tsx';
import { useStudyCalendarItems } from '../modules/study/calendar.ts';
import { StudyPlan } from '../modules/study/plan.tsx';
import { StudyPlans } from '../modules/study/plans.tsx';
import { StudyReview } from '../modules/study/review.tsx';
import { StudyWidget } from '../modules/study/widget.tsx';

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
    name: 'study',
    todayItems: useStudyTodayLines,
    daySummary: useStudyDaySummary,
    records: studyDays,
    copy: {},
    calendarItems: useStudyCalendarItems,
    sections: [
      { zone: 'study', id: 'piano', label: m.study_plan, component: StudyPlan },
      { zone: 'study', id: 'ripasso', label: m.study_review, component: StudyReview },
      { zone: 'study', id: 'libreria', label: m.study_library, component: StudyLibrary },
      { zone: 'study', id: 'piani', label: m.study_plans, component: StudyPlans },
    ],
    widgets: [{ id: 'study', label: m.zone_study, sizes: ['small', 'medium', 'large'], component: StudyWidget }],
  },
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
