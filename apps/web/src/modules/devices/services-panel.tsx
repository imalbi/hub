import { Panel } from '../../components/panel.tsx';
import { useLiveModuleUIs } from '../../lib/enabled-modules.ts';
import { m } from '../../paraglide/messages.js';

/** The external devices of this PC, one row per `deviceRows` component of every module that is on; nothing when none. */
export function ServicesPanel({ className }: { className?: string }) {
  const rows = useLiveModuleUIs().flatMap((module) =>
    [module.deviceRows ?? []].flat().map((Row, index) => ({ Row, key: `${module.name}-${index}` })),
  );
  if (rows.length === 0) return null;
  return (
    <Panel title={m.devices_services_title()} className={className}>
      <div className="flex flex-col gap-md">
        {rows.map(({ Row, key }) => (
          <Row key={key} />
        ))}
      </div>
    </Panel>
  );
}
