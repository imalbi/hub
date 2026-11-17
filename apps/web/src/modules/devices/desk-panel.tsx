import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeviceMobileIcon } from '@phosphor-icons/react';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { useTRPC } from '../../lib/trpc.ts';
import { EmptyState } from '../../components/ui/empty-state.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { HoldButton } from '../../components/hold-button.tsx';
import { useNow } from '../../lib/use-now.ts';
import { QrSection } from './qr-section.tsx';
import { AgentsSection } from './agents-section.tsx';
import { lastSeen } from './last-seen.ts';
import { ServicesPanel } from './services-panel.tsx';

export function usePairing() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const createCode = useMutation(trpc.pairing.createCode.mutationOptions());
  // Ticks on the code's own seconds while one is shown, on the clock's otherwise (for "last seen").
  const now = useNow(createCode.data?.expiresAt ?? 'clock');
  const remaining = createCode.data ? Math.max(0, Math.ceil((createCode.data.expiresAt - now) / 1000)) : 0;
  // The list changes only when someone pairs, so it refreshes while a code is on screen instead of by push.
  const devices = useQuery({ ...trpc.devices.list.queryOptions(), refetchInterval: remaining > 0 ? 2000 : false });
  const revoke = useMutation(
    trpc.devices.revoke.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.devices.list.queryKey() }),
    }),
  );
  return { createCode, now, remaining, devices, revoke };
}
type Pairing = ReturnType<typeof usePairing>;

function Step({ n, active = false, children }: { n: number; active?: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-start gap-md ${n > 1 ? 'border-t border-dashed border-border pt-lg' : ''}`}>
      <span
        aria-hidden
        className={`flex size-xl shrink-0 items-center justify-center rounded-full text-label tabular-nums ${active ? 'bg-primary text-primary-foreground' : 'bg-surface'}`}
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-sm">{children}</div>
    </li>
  );
}

/** Two steps to connect a phone: open the deck (the QR, only with a LAN address), then type the code in the app. */
function ConnectPanel({ pairing: { createCode, remaining } }: { pairing: Pairing }) {
  const trpc = useTRPC();
  const deckUrl = useQuery(trpc.devices.deckUrl.queryOptions());
  return (
    <Panel title={m.devices_connect_title()}>
      <ol className="flex flex-col gap-lg">
        <Step n={1}>
          {deckUrl.isSuccess && !deckUrl.data ? (
            <span className="text-body text-muted-foreground">{m.devices_step_open_lan()}</span>
          ) : (
            <>
              <span className="text-body">{m.devices_step_open()}</span>
              <QrSection />
            </>
          )}
        </Step>
        <Step n={2} active>
          <span className="text-body">{m.devices_step_code()}</span>
          <RegistryButton
            secondary
            label={m.devices_create_code()}
            action={() => createCode.mutateAsync()}
            disabled={createCode.isPending}
          />
          {createCode.data && remaining > 0 && (
            <div className="flex w-full flex-col gap-xs">
              {/* Two groups of three to read aloud and type; the gap is visual only, so the text stays six digits. */}
              <output aria-label={m.devices_code_label()} className="text-display tabular-nums">
                {/* Inline spans: flex items are blocks, and innerText would split the code with a newline. */}
                <span>{createCode.data.code.slice(0, 3)}</span>
                <span className="ml-md">{createCode.data.code.slice(3)}</span>
              </output>
              <p className="text-caption text-muted-foreground tabular-nums">
                {m.devices_code_expires({ seconds: remaining })}
              </p>
            </div>
          )}
          {createCode.data && remaining === 0 && (
            <p className="text-caption text-muted-foreground">{m.devices_code_expired()}</p>
          )}
        </Step>
      </ol>
    </Panel>
  );
}

export function PhonesList({ pairing: { devices, revoke, now } }: { pairing: Pairing }) {
  return (
    <section className="flex flex-col gap-md" aria-label={m.devices_phones_title()}>
      <h3 className="text-label text-muted-foreground">{m.devices_phones_title()}</h3>
      {devices.data?.length === 0 && (
        <EmptyState
          illustration={<DeviceMobileIcon className="size-3xl text-muted-foreground" aria-hidden />}
          title={m.devices_empty()}
          description={m.devices_empty_hint()}
        />
      )}
      <ul className="flex flex-col">
        {devices.data?.map((device) => (
          <li key={device.id} className="flex items-center gap-md border-t border-dashed border-border py-md">
            <DeviceMobileIcon className="size-icon-lg shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-label">{device.name}</span>
              <span className="text-caption text-muted-foreground">
                {m.device_last_seen({ when: lastSeen(device.lastSeenAt, now) })}
              </span>
            </div>
            <HoldButton
              label={m.device_revoke_hold({ name: device.name })}
              idle={m.device_revoke()}
              done={m.device_revoked()}
              outline
              onConfirm={() => revoke.mutateAsync({ id: device.id, confirmed: true })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Dispositivi page as grid cells: connecting a phone and this PC's own devices on the left (5 columns), who has
 * access on the right (7). `fill` makes both columns as tall as the surface, the right panel scrolling inside.
 */
export function DevicesBoard({ fill = false }: { fill?: boolean }) {
  const trpc = useTRPC();
  const pairing = usePairing();
  const agents = useQuery({ ...trpc.agents.list.queryOptions(), enabled: pairing.devices.isSuccess });
  return (
    <>
      <div className="col-span-5 flex min-h-0 min-w-0 flex-col gap-lg">
        <ConnectPanel pairing={pairing} />
        <ServicesPanel className={fill ? 'min-h-0 flex-1 overflow-y-auto' : ''} />
      </div>
      <Panel
        title={m.devices_access_title()}
        className={`col-span-7 ${fill ? 'min-h-0 overflow-y-auto' : ''}`}
        action={
          pairing.devices.data &&
          agents.data && (
            <span className="text-caption text-muted-foreground">
              {m.devices_access_count({ devices: pairing.devices.data.length, agents: agents.data.length })}
            </span>
          )
        }
      >
        <PhonesList pairing={pairing} />
        <AgentsSection enabled={pairing.devices.isSuccess} />
      </Panel>
    </>
  );
}
