import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Panel } from '../components/panel.tsx';
import { m } from '../paraglide/messages.js';
import { useTRPC } from '../trpc.ts';
import { Smartphone } from 'lucide-react';
import { EmptyState } from '../components/ui/empty-state.tsx';
import { RegistryButton } from './registry-button.tsx';

const button = 'min-h-touch rounded-full border border-border px-lg text-label disabled:opacity-60';

function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return [now, () => setNow(Date.now())] as const;
}

function lastSeen(at: number, now: number) {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return m.device_seen_now();
  if (minutes < 60) return m.device_seen_minutes({ minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? m.device_seen_hours({ hours }) : m.device_seen_days({ days: Math.floor(hours / 24) });
}

export function DevicesPanel({ className = '' }: { className?: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [now, refreshClock] = useClock();
  const [confirming, setConfirming] = useState<number | null>(null);

  // The tick can be a second old: refresh the clock when the code arrives, or a fresh two-minute code reads 121 s.
  const createCode = useMutation(trpc.pairing.createCode.mutationOptions({ onSuccess: refreshClock }));
  const remaining = createCode.data ? Math.max(0, Math.ceil((createCode.data.expiresAt - now) / 1000)) : 0;
  // The list changes only when someone pairs, so it refreshes while a code is on screen instead of by push.
  const devices = useQuery({ ...trpc.devices.list.queryOptions(), refetchInterval: remaining > 0 ? 2000 : false });
  const revoke = useMutation(
    trpc.devices.revoke.mutationOptions({
      onSuccess: () => {
        setConfirming(null);
        return queryClient.invalidateQueries({ queryKey: trpc.devices.list.queryKey() });
      },
    }),
  );

  return (
    <Panel title={m.devices_title()} className={className}>
      <div className="flex flex-col items-start gap-md">
        <RegistryButton
          secondary
          label={m.devices_create_code()}
          action={() => createCode.mutateAsync()}
          disabled={createCode.isPending}
        />
        {createCode.data && remaining > 0 && (
          <div className="flex flex-col gap-xs">
            <output aria-label={m.devices_code_label()} className="text-display tabular-nums">
              {createCode.data.code}
            </output>
            <p className="text-caption text-muted-foreground tabular-nums">
              {m.devices_code_expires({ seconds: remaining })}
            </p>
          </div>
        )}
        {createCode.data && remaining === 0 && (
          <p className="text-caption text-muted-foreground">{m.devices_code_expired()}</p>
        )}
      </div>

      {devices.data?.length === 0 && (
        <EmptyState
          illustration={<Smartphone className="size-3xl text-muted-foreground" aria-hidden />}
          title={m.devices_empty()}
          description={m.devices_empty_hint()}
        />
      )}
      <ul className="flex flex-col gap-sm">
        {devices.data?.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-lg">
            <div className="flex flex-col">
              <span className="text-label">{device.name}</span>
              <span className="text-caption text-muted-foreground">
                {m.device_last_seen({ when: lastSeen(device.lastSeenAt, now) })}
              </span>
            </div>
            {confirming === device.id ? (
              <div className="flex gap-xs">
                <RegistryButton
                  secondary
                  label={m.device_revoke_confirm()}
                  action={() => revoke.mutateAsync({ id: device.id })}
                  disabled={revoke.isPending}
                  className="border-danger text-danger"
                />
                <button type="button" onClick={() => setConfirming(null)} className={button}>
                  {m.device_revoke_cancel()}
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={`${m.device_revoke()} ${device.name}`}
                onClick={() => setConfirming(device.id)}
                className={button}
              >
                {m.device_revoke()}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
