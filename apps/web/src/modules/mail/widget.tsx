import { Readout } from '../../components/readout.tsx';
import { Panel } from '../../components/panel.tsx';
import { m } from '../../paraglide/messages.js';
import { useMail } from './use-mail.ts';
import { summarizeMail } from './summary.ts';

export function MailWidget() {
  const mail = useMail();
  const accounts = mail.data?.accounts;
  const summary = accounts && summarizeMail(accounts);
  const latest = accounts
    ?.flatMap((account) => account.latest)
    .toSorted((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
  return (
    <Panel title={m.module_mail()} className="h-full">
      {!summary ? (
        m.tile_loading()
      ) : summary.count === null ? (
        m.mail_error()
      ) : (
        <p>
          {summary.capped && m.mail_at_least()}
          <Readout>{summary.count}</Readout> {m.mail_widget_unread()}
        </p>
      )}
      {latest && (
        <p className="text-caption">
          {latest.from?.name || latest.from?.email}
          <br />
          {latest.subject}
        </p>
      )}
    </Panel>
  );
}
