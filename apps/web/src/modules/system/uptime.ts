import { m } from '../../paraglide/messages.js';

/** Seconds as the largest whole unit, hours with their minutes ("3 h 12 min"), for the Server figure and its widget. */
export function uptimeText(seconds: number) {
  if (seconds < 60) return m.duration_seconds({ value: seconds });
  if (seconds < 3600) return m.duration_minutes({ value: Math.floor(seconds / 60) });
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes ? m.duration_hours_minutes({ hours, minutes }) : m.duration_hours({ value: hours });
}
