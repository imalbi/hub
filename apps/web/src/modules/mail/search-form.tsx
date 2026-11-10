import { useState, type FormEvent, type ReactNode } from 'react';
import type { inferRouterInputs } from '@trpc/server';
import type { MailRouter } from './use-mail.ts';
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ActionButton } from '../../components/ui/action-button.tsx';
import { m } from '../../paraglide/messages.js';

type Filter = inferRouterInputs<MailRouter>['search']['filter'];

/** One toolbar row: `leading` (the account) first, then the filters, then the toggle and Cerca. */
export function SearchForm({ leading, onSearch }: { leading: ReactNode; onSearch: (filter: Filter | null) => void }) {
  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [after, setAfter] = useState('');
  const [unseen, setUnseen] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    const filter = {
      from: from.trim() || undefined,
      subject: subject.trim() || undefined,
      body: body.trim() || undefined,
      after: after || undefined,
      unseen: unseen || undefined,
    };
    onSearch(Object.values(filter).some(Boolean) ? filter : null);
  }
  return (
    <form onSubmit={submit} className="flex items-end gap-sm">
      <div className="min-w-0 flex-1">{leading}</div>
      <div className="min-w-0 flex-1">
        <Input label={m.mail_from()} value={from} onValueChange={setFrom} maxLength={200} />
      </div>
      <div className="min-w-0 flex-1">
        <Input label={m.mail_subject()} value={subject} onValueChange={setSubject} maxLength={200} />
      </div>
      <div className="min-w-0 flex-1">
        <Input label={m.mail_body()} value={body} onValueChange={setBody} maxLength={200} />
      </div>
      <div className="min-w-0 flex-1">
        <Input label={m.mail_after()} type="date" value={after} onValueChange={setAfter} />
      </div>
      <div className="flex min-h-touch shrink-0 items-center gap-md whitespace-nowrap">
        <Checkbox label={m.mail_unread_only()} checked={unseen} onCheckedChange={setUnseen} />
        <ActionButton type="submit" label={m.mail_search()} />
      </div>
    </form>
  );
}
