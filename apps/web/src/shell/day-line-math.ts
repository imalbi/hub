/** Position on the local-day ruler from 06:00 to 24:00. */
export function dayPosition(at: number | Date, reference: number | Date = at) {
  const start = new Date(reference);
  start.setHours(6, 0, 0, 0);
  const end = new Date(reference);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, Math.min(1, (Number(at) - start.getTime()) / (end.getTime() - start.getTime())));
}
