import { Readout } from '../../components/readout.tsx';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Panel } from '../../components/panel.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { m } from '../../paraglide/messages.js';
import { PhonesList, usePairing } from './desk-panel.tsx';
import { LocalAgentRow, TokenAgentRow } from './agents-section.tsx';

export function DevicesWidget({ size }: { size: WidgetSize }) {
  const pairing = usePairing();
  const trpc = useTRPC();
  const agents = useQuery({ ...trpc.agents.list.queryOptions(), enabled: pairing.devices.isSuccess });
  return (
    <Panel
      title={m.devices_access_title()}
      className="h-full overflow-y-auto"
      action={
        size === 'small' && agents.data ? (
          <span className="text-caption text-muted-foreground">
            {m.devices_remote_count({ count: agents.data.length })}
          </span>
        ) : undefined
      }
    >
      {size === 'small' ? (
        <div className="flex flex-1 items-end justify-between">
          <div>
            <p>
              <Readout>{pairing.devices.data?.length ?? 0}</Readout>
            </p>
            <p className="text-caption text-muted-foreground">{m.devices_widget_phones()}</p>
          </div>
          <Link to="/desk/devices" className="rounded-full border border-border px-md py-sm text-label">
            {m.devices_widget_connect()}
          </Link>
        </div>
      ) : (
        <>
          <p>
            <Readout>{pairing.devices.data?.length ?? 0}</Readout> {m.devices_widget_phones()}
          </p>
          <PhonesList pairing={pairing} />
          <section aria-label={m.agents_title()} className="flex flex-col gap-md">
            <h3 className="text-label text-muted-foreground">{m.agents_title()}</h3>
            <ul className="flex flex-col">
              <LocalAgentRow />
              {agents.data?.map((agent) => (
                <TokenAgentRow key={agent.id} id={agent.id} name={agent.name} />
              ))}
            </ul>
          </section>
          <p className="text-caption text-muted-foreground">
            {m.devices_widget_hint()}{' '}
            <Link to="/desk/devices" className="underline">
              {m.devices_widget_link()}
            </Link>
          </p>
        </>
      )}
    </Panel>
  );
}
