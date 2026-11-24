import { createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { moduleUIs } from './modules.ts';
import { useTRPC } from './trpc.ts';
import { AvailabilityContext, EnabledContext, useIsOn } from './module-enabled.ts';

const neverPending = () => false;

function AvailabilityLayer({
  name,
  useAvailable,
  usePending = neverPending,
  children,
}: {
  name: string;
  useAvailable: () => boolean;
  usePending?: () => boolean;
  children?: ReactNode;
}) {
  const parent = useContext(AvailabilityContext);
  // oxlint-disable-next-line react/hooks -- key={ui.name} binds this layer to one fixed module hook.
  const available = useAvailable();
  // oxlint-disable-next-line react/hooks -- The same module supplies this fixed pending hook for the layer's lifetime.
  const pending = usePending();
  return createElement(AvailabilityContext, { value: { ...parent, [name]: { available, pending } } }, children);
}

/** Each module's hooks have their own stable component, independent of its enabled state. */
export function ModuleAvailabilityProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const enabled = useQuery(trpc.modules.enabled.queryOptions()).data;
  let content = children;
  for (const ui of moduleUIs.toReversed()) {
    if (ui.useAvailable)
      content = createElement(
        AvailabilityLayer,
        { key: ui.name, name: ui.name, useAvailable: ui.useAvailable, usePending: ui.usePending },
        content,
      );
  }
  return createElement(EnabledContext, { value: enabled }, content);
}

export { useIsOn };

export function usePendingModule(zone: string) {
  const enabled = useContext(EnabledContext);
  const availability = useContext(AvailabilityContext);
  return moduleUIs.find(
    (ui) =>
      (!enabled || enabled.includes(ui.name)) &&
      (ui.zone?.id === zone || ui.sections?.some((section) => section.zone === zone)) &&
      availability[ui.name]?.pending,
  );
}

/** The live UIs supply rail entries, sections, widgets and deck tiles. */
export function useLiveModuleUIs() {
  const isOn = useIsOn();
  return moduleUIs.filter((ui) => isOn(ui.name));
}
