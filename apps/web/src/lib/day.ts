const pad = (value: number) => String(value).padStart(2, '0');

/** A local calendar day as `YYYY-MM-DD`: the same shape the server stores in `forDay`. */
export function localDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, days: number) {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return localDay(new Date(year, month - 1, date + days));
}

/** A `YYYY-MM-DD` day as a Date at local noon, safe from any DST shift when formatted. */
export function dayDate(day: string) {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}
