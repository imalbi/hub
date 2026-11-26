import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Switch } from '../../components/ui/switch.tsx';
import { m } from '../../paraglide/messages.js';
import { dayTitle, monthOf, monthTitle, shiftMonth, weekDays, type DayEntry, type Show } from './days.ts';

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

export function CalendarAside({
  today,
  selected,
  mini,
  setMini,
  miniDays,
  shown,
  show,
  setShow,
  onSelect,
  week = false,
}: {
  today: string;
  selected: string;
  mini: string;
  setMini: (month: string) => void;
  miniDays: string[];
  shown: Map<string, DayEntry[]>;
  show: Show;
  setShow: (show: Show) => void;
  onSelect: (day: string) => void;
  week?: boolean;
}) {
  const activeWeek = week ? weekDays(selected) : [];
  const toggles: Array<[keyof Show, string]> = [
    ['work', m.calendar_kind_work()],
    ['study', m.calendar_kind_study()],
    ['shift', m.calendar_shifts()],
    ['note', m.calendar_kind_note()],
  ];
  const card = 'flex flex-col gap-sm rounded-lg bg-muted p-md';
  return (
    <aside className="flex min-h-0 w-day-panel shrink-0 flex-col gap-md">
      <section aria-label={m.calendar_pick_month()} className={card}>
        <div className="flex items-center justify-between">
          <span className="text-label">{monthTitle(mini)}</span>
          <span className="flex gap-xs">
            <button
              type="button"
              aria-label={m.calendar_month_previous()}
              onClick={() => setMini(shiftMonth(mini, -1))}
              className="cursor-pointer text-muted-foreground"
            >
              <CaretLeftIcon className="size-icon-sm" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={m.calendar_month_next()}
              onClick={() => setMini(shiftMonth(mini, 1))}
              className="cursor-pointer text-muted-foreground"
            >
              <CaretRightIcon className="size-icon-sm" aria-hidden />
            </button>
          </span>
        </div>
        <div aria-hidden className="grid grid-cols-7 text-center text-caption text-muted-foreground">
          {WEEKDAY_LETTERS.map((letter, index) => (
            <span key={index}>{letter}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-3xs text-center text-label font-normal">
          {miniDays.map((day) => {
            const busy = (shown.get(day) ?? []).length > 0;
            const inMonth = monthOf(day) === mini;
            const style =
              day === today
                ? 'rounded-full bg-foreground font-semibold text-background'
                : (week ? activeWeek.includes(day) : day === selected)
                  ? week
                    ? `bg-foreground/10 ${day === activeWeek[0] ? 'rounded-l-full' : day === activeWeek[6] ? 'rounded-r-full' : ''}`
                    : 'rounded-full outline outline-foreground/40'
                  : inMonth
                    ? ''
                    : 'text-muted-foreground/50';
            return (
              <button
                key={day}
                type="button"
                aria-label={dayTitle(day)}
                aria-pressed={week ? activeWeek.includes(day) : day === selected}
                onClick={() => {
                  onSelect(day);
                  setMini(monthOf(day));
                }}
                className={`relative cursor-pointer pt-2xs pb-xs tabular-nums ${style}`}
              >
                {Number(day.slice(8))}
                {busy && day !== today && (
                  <span
                    aria-hidden
                    className="absolute bottom-3xs left-1/2 size-2xs -translate-x-1/2 rounded-full bg-accent"
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>
      <section aria-label={m.calendar_show()} className={card}>
        <h3 className="text-label">{m.calendar_show()}</h3>
        {toggles.map(([kind, label]) => (
          <Switch
            key={kind}
            label={label}
            labelPosition="start"
            className="w-full"
            checked={show[kind]}
            onCheckedChange={(on) => setShow({ ...show, [kind]: on })}
          />
        ))}
      </section>
    </aside>
  );
}
