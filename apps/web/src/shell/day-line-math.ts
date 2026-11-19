/** Position on the local-day ruler from 06:00 to 24:00. */
export function dayPosition(at: number | Date, reference: number | Date = at) {
  const start = new Date(reference);
  start.setHours(6, 0, 0, 0);
  const end = new Date(reference);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, Math.min(1, (Number(at) - start.getTime()) / (end.getTime() - start.getTime())));
}

type Caption = { x: number; width: number; shortWidth: number };
type Placement = { x: number; row: number; short: boolean };

/** Input is in time order; each occupied interval includes only its measured text. */
export function packCaptions(width: number, captions: Caption[]): Array<Placement | null> {
  const rows: Array<Array<{ start: number; end: number }>> = [[], []];
  return captions.map((caption) => {
    const left = Math.max(0, Math.min(caption.x, width - caption.width));
    for (const [row, intervals] of rows.entries()) {
      if (caption.width <= width && intervals.every((item) => left + caption.width <= item.start || left >= item.end)) {
        intervals.push({ start: left, end: left + caption.width });
        return { x: left, row, short: false };
      }
    }
    const options: Array<{ x: number; row: number }> = [];
    for (const [row, intervals] of rows.entries()) {
      const sorted = intervals.toSorted((a, b) => a.start - b.start);
      let start = 0;
      for (const end of [...sorted.map((item) => item.start), width]) {
        if (end - start >= caption.shortWidth)
          options.push({ x: Math.max(start, Math.min(caption.x, end - caption.shortWidth)), row });
        const next = sorted.find((item) => item.start === end);
        if (next) start = next.end;
      }
    }
    const best = options.toSorted((a, b) => Math.abs(a.x - caption.x) - Math.abs(b.x - caption.x))[0];
    // shortcut: a fully occupied ruler has no space even for the time; upgrade to an overflow list if this occurs.
    if (!best) return null;
    rows[best.row]?.push({ start: best.x, end: best.x + caption.shortWidth });
    return { ...best, short: true };
  });
}
