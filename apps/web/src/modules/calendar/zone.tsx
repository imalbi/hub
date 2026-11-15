import { lazy, Suspense } from 'react';

// Lazy: the page asks which modules are on, and that hook reads the module list that holds this zone.
const Page = lazy(() => import('./page.tsx').then((module) => ({ default: module.CalendarPage })));

export function CalendarZone() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
