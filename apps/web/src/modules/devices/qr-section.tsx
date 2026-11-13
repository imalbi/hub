import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';
import { qrPath } from './qr.ts';

/** Shown only when the config has a LAN origin. It encodes the deck address alone, never a pairing code. */
export function QrSection() {
  const trpc = useTRPC();
  const deckUrl = useQuery(trpc.devices.deckUrl.queryOptions());
  if (!deckUrl.data) return null;
  const { d, size } = qrPath(deckUrl.data);
  return (
    <figure className="flex flex-col items-start gap-sm">
      <figcaption className="text-label">{m.devices_qr_title()}</figcaption>
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
      <p className="text-caption text-muted-foreground">{deckUrl.data}</p>
    </figure>
  );
}
