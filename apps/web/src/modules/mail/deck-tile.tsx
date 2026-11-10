import { EnvelopeIcon } from '@phosphor-icons/react';
import { Tile } from '../../components/tile.tsx';
import { m } from '../../paraglide/messages.js';
import { useMail } from './use-mail.ts';
import { summarizeMail } from './summary.ts';

export function MailTile() {
  const mail = useMail();
  const accounts = mail.data?.accounts;
  const summary = accounts && summarizeMail(accounts);
  const state = !summary
    ? m.tile_loading()
    : summary.count === null
      ? m.mail_error()
      : summary.capped
        ? m.mail_count_capped({ count: summary.count })
        : m.mail_count({ count: summary.count });
  return <Tile icon={EnvelopeIcon} label={m.module_mail()} state={state} badge={summary?.count || undefined} />;
}
