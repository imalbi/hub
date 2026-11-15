import { useEffect, useState } from 'react';
import { useLiveModuleUIs } from '../../lib/enabled-modules.ts';
import type { CalendarItem, CalendarItemsHook } from '../../lib/module-ui.ts';
import type { Range } from './use-calendar.tsx';

/** Runs one module's hook in a component of its own (hook order stays stable as modules switch on and off). */
function Source({
  id,
  range,
  useItems,
  report,
}: {
  id: string;
  range: Range;
  useItems: CalendarItemsHook;
  report: (id: string, items: CalendarItem[] | undefined) => void;
}) {
  // Not named `use`: the React Compiler treats that name as React's `use` and may skip the call.
  const items = useItems(range);
  const key = JSON.stringify(items);
  useEffect(() => {
    report(id, items);
    return () => report(id, undefined);
    // The serialised value is the dependency: a hook may return a fresh array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, report]);
  return null;
}

/** What the live modules contribute to `range`, in module order, plus the components that must be rendered to get it. */
export function useContributions(range: Range) {
  const uis = useLiveModuleUIs();
  const hooks = uis.flatMap((ui) =>
    [ui.calendarItems ?? []].flat().map((hook, index) => ({ hook, id: `${ui.name}-${index}` })),
  );
  const [reported, setReported] = useState<Record<string, CalendarItem[] | undefined>>({});
  const [report] = useState(
    () => (id: string, items: CalendarItem[] | undefined) =>
      setReported((previous) =>
        JSON.stringify(previous[id]) === JSON.stringify(items) ? previous : { ...previous, [id]: items },
      ),
  );
  return {
    items: hooks.flatMap(({ id }) => reported[id] ?? []),
    sources: hooks.map(({ hook, id }) => <Source key={id} id={id} range={range} useItems={hook} report={report} />),
  };
}
