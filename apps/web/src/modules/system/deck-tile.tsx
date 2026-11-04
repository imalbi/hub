import { Cpu } from 'lucide-react';
import { m } from '../../paraglide/messages.js';

/** Holds the Sistema page's place until its actions exist (step 09). Not a button: it does nothing yet. */
export function SystemTile() {
  return (
    <div className="flex flex-col items-start gap-xs rounded-lg border border-dashed border-border p-md text-muted-foreground">
      <Cpu className="size-icon" aria-hidden />
      <span className="text-label">{m.zone_system()}</span>
      <span className="text-caption">{m.system_soon()}</span>
    </div>
  );
}
