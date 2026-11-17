import type { RecordSource } from '../../lib/module-ui.ts';
import { m } from '../../paraglide/messages.js';
import { rowKey } from './inbox-list.tsx';
import { mailDate } from './mail-date.ts';
import { postaHref } from './search.ts';
import { mailClient } from './use-mail.ts';

/** Posta in the palette (step 64): subjects of every inbox, matched by himalaya on the server, 3 newest rows and the count. */
export const mailMessages: RecordSource = {
  id: 'mail-messages',
  label: m.module_mail,
  allHref: (query) => postaHref(query),
  search: async (query, signal) => {
    const { total, rows } = await mailClient.searchRecords.query({ query }, { signal });
    return {
      total,
      rows: rows.map((row) => ({
        id: rowKey(row),
        title: row.subject,
        detail: [row.from?.name || row.from?.email, mailDate(row.date), row.label].filter(Boolean).join(' · '),
        href: postaHref(row.subject, rowKey(row)),
      })),
    };
  },
};
