import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@hub/server';
import { DeviceRow } from '../../components/device-row.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

type BackupState = inferRouterOutputs<AppRouter>['backup']['state'];

const time = new Intl.DateTimeFormat('it', { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short' });

/** "oggi, 03:12", "ieri, 03:12" or "4 nov, 03:12": a missed day is shown plainly, never as an alert. */
export function backupWhen(at: number, now: Date) {
  const when = new Date(at);
  const stamp = time.format(when);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (when >= midnight) return m.system_backup_today({ time: stamp });
  if (when >= new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() - 1))
    return m.system_backup_yesterday({ time: stamp });
  return m.system_backup_day({ day: day.format(when), time: stamp });
}

function stateText(state: BackupState | undefined) {
  if (!state) return '';
  if (state.status === 'off') return m.system_backup_off();
  if (state.status === 'never') return m.system_backup_never();
  if (state.status === 'failed') return m.system_backup_failed();
  const when = backupWhen(state.at, new Date());
  return state.copies === 1
    ? m.system_backup_copies_one({ when })
    : m.system_backup_copies_many({ when, count: state.copies });
}

/** The "Backup" row of Questo PC: the last copy, and a button that makes one now. */
export function BackupRow() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const state = useQuery(trpc.backup.state.queryOptions());
  const run = useMutation(trpc.backup.run.mutationOptions());
  return (
    <DeviceRow label={m.system_backup_row()} state={stateText(state.data)}>
      <RegistryButton
        secondary
        label={m.system_backup_action()}
        name={m.system_backup_action_name()}
        action={async () => {
          const next = await run.mutateAsync();
          queryClient.setQueryData(trpc.backup.state.queryKey(), next);
        }}
      />
    </DeviceRow>
  );
}
