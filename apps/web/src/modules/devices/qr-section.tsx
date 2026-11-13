import { useQuery } from '@tanstack/react-query';
import { ActionButton } from '../../components/ui/action-button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { qrPath } from './qr.ts';

/** The "Mostra QR" action and its dialog, only when the config has a LAN origin. It encodes the deck address alone, never a pairing code. */
export function QrSection() {
  const trpc = useTRPC();
  const deckUrl = useQuery(trpc.devices.deckUrl.queryOptions());
  if (!deckUrl.data) return null;
  const { d, size } = qrPath(deckUrl.data);
  return (
    <Dialog
      size="sm"
      title={m.devices_qr_title()}
      closeLabel={m.devices_qr_close()}
      trigger={
        <ActionButton variant="outline" className="min-h-touch">
          {m.devices_qr_show()}
        </ActionButton>
      }
    >
      <figure className="flex flex-col items-center gap-sm px-lg pb-lg">
        {/* A QR needs dark on light to scan, so the light square stays whatever the theme is. */}
        <svg
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline svg has no <img> equivalent
          role="img"
          aria-label={m.devices_qr_label()}
          viewBox={`0 0 ${size} ${size}`}
          shapeRendering="crispEdges"
          className="bg-white text-black size-qr shrink-0 rounded-md"
        >
          <path d={d} fill="currentColor" />
        </svg>
        <figcaption className="text-caption text-muted-foreground">{deckUrl.data}</figcaption>
      </figure>
    </Dialog>
  );
}
