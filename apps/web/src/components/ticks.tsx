import { tickScale } from './ticks-scale.ts';
import { m } from '../paraglide/messages.js';

export function Ticks({ value, total }: { value: number; total: number }) {
  const { count, filled } = tickScale(value, total);
  return (
    // The image is drawn from a dynamic number of marks rather than a static image file.
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
    <span role="img" aria-label={m.ticks_count({ value: filled, total: count })} className="ticks">
      {Array.from({ length: count }, (_, index) => (
        <i key={index} data-filled={index < filled || undefined} />
      ))}
    </span>
  );
}
