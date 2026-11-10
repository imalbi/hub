import { useQuery } from '@tanstack/react-query';
import { moduleUIs } from './modules.ts';
import { useTRPC } from './trpc.ts';
import { useMailAccounts } from '../modules/mail/use-mail.ts';

/**
 * Whether a module is on, from `modules.enabled` (names only, so the deck may read it too). Until the answer arrives
 * everything counts as on: hiding on a guess would flash the rail on every load.
 */
export function useIsOn() {
  const trpc = useTRPC();
  const enabled = useQuery(trpc.modules.enabled.queryOptions()).data;
  const mail = useMailAccounts(!enabled || enabled.includes('mail'));
  return (name: string) => (!enabled || enabled.includes(name)) && (name !== 'mail' || mail.isPending || !!mail.data);
}

/** The module UIs whose module is on: what rail entries, sections, widgets and deck tiles are built from. */
export function useLiveModuleUIs() {
  const isOn = useIsOn();
  return moduleUIs.filter((ui) => isOn(ui.name));
}
