import { m } from '../../paraglide/messages.js';

/** "adesso", "5 min fa", "3 h fa", "2 g fa": the same wording for a device's last access and an agent's last call. */
export function lastSeen(at: number, now: number) {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return m.device_seen_now();
  if (minutes < 60) return m.device_seen_minutes({ minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? m.device_seen_hours({ hours }) : m.device_seen_days({ days: Math.floor(hours / 24) });
}
