// Adapted from Hairline UI's date-picker `parseDate` (MIT), read in Italian.
import { addDays } from './days.ts';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
// getUTCDay order, Sunday first.
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

const toDay = (date: Date) => date.toISOString().slice(0, 10);

function valid(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 ? toDay(date) : null;
}

// No year: the next time that date comes round.
function withYear(day: number, month: number, year: string | undefined, today: string) {
  if (month < 1) return null;
  if (year) return valid(Number(year.length === 2 ? `20${year}` : year), month, day);
  const thisYear = valid(Number(today.slice(0, 4)), month, day);
  return thisYear && thisYear < today ? valid(Number(today.slice(0, 4)) + 1, month, day) : thisYear;
}

function addMonths(day: string, count: number) {
  const date = new Date(`${day}T00:00:00Z`);
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, last));
  return toDay(date);
}

/** Reads a day written in Italian ("domani", "ven", "tra 3 giorni", "4 nov", "4/11") relative to `today`; null if it can't. */
export function parseDay(input: string, today: string): string | null {
  const text = input.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  if (!text) return null;
  if (text === 'oggi') return today;
  if (text === 'domani') return addDays(today, 1);
  if (text === 'dopodomani') return addDays(today, 2);
  let match = /^(?:tra|fra) (\d+|un|una) (giorn[oi]|settiman[ae]|mes[ei])$/.exec(text);
  if (match) {
    const count = /^\d/.test(match[1]) ? Number(match[1]) : 1;
    const unit = match[2];
    if (unit.startsWith('mes')) return addMonths(today, count);
    return addDays(today, unit.startsWith('sett') ? count * 7 : count);
  }
  match = /^(?:(?:il |la )?prossim[oa] )?(lun|mar|mer|gio|ven|sab|dom)[a-z]*$/.exec(text);
  if (match) {
    const want = WEEKDAYS.indexOf(match[1]);
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    const diff = (want - now + 7) % 7;
    return addDays(today, diff === 0 ? 7 : diff);
  }
  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) return valid(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2}) ([a-z]{3})[a-z]*(?: (\d{4}))?$/.exec(text);
  if (match) return withYear(Number(match[1]), MONTHS.indexOf(match[2]) + 1, match[3], today);
  // 4/11/2026 reads day first.
  match = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (match) return withYear(Number(match[1]), Number(match[2]), match[3], today);
  return null;
}
