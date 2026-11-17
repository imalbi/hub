import type { TodayDay, TodayLine } from '../../lib/module-ui.ts';
import { m } from '../../paraglide/messages.js';
import { summarizeMail } from './summary.ts';
import { useMail } from './use-mail.ts';

/** Oggi's Posta line: the unread count the Posta widget shows, nothing at zero. Today only. */
export function useMailTodayLines(day: TodayDay): TodayLine[] | null {
  const accounts = useMail().data?.accounts;
  const summary = accounts && summarizeMail(accounts);
  if (day !== 'today' || !summary?.count) return null;
  return [
    {
      id: 'mail-unread',
      chip: m.mail_chip(),
      text: summary.capped ? m.mail_count_capped({ count: summary.count }) : m.mail_count({ count: summary.count }),
      href: '/desk/messaggi',
    },
  ];
}
