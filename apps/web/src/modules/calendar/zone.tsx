import { lazy, Suspense } from 'react';
import type { WidgetSize } from '../../lib/widget-size.ts';

// Lazy: the page and widget ask which modules are on, and that hook reads the module list that imports this file.
const Page = lazy(() => import('./page.tsx').then((module) => ({ default: module.CalendarPage })));
const Widget = lazy(() => import('./widget.tsx').then((module) => ({ default: module.CalendarWidget })));

export function CalendarZone() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}

export function CalendarWidgetSlot({ size }: { size: WidgetSize }) {
  return (
    <Suspense fallback={null}>
      <Widget size={size} />
    </Suspense>
  );
}
