export type Series = {
  id: string;
  title: string;
  kind: 'event' | 'shift';
  person: string | null;
  source: string;
  fromDay: string;
  untilDay: string | null;
  days: { weekday: number; start: string | null; end: string | null }[];
};

export function expandSeries(series: Series, from: string, to: string, skips: readonly string[]) {
  const result = [];
  const first = from > series.fromDay ? from : series.fromDay;
  const last = series.untilDay && series.untilDay < to ? series.untilDay : to;
  const skipped = new Set(skips);
  const lastTime = Date.parse(`${last}T00:00:00Z`);
  for (let date = new Date(`${first}T00:00:00Z`); date.getTime() <= lastTime; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    const rule = series.days.find((item) => item.weekday === (date.getUTCDay() || 7));
    if (rule && !skipped.has(day)) {
      result.push({
        id: `series:${series.id}:${day}`,
        title: series.title,
        day,
        start: rule.start,
        end: rule.end,
        kind: series.kind,
        person: series.person,
        source: series.source,
        seriesId: series.id,
        seriesDay: day,
      });
    }
  }
  return result;
}
