import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HoldButton } from '../../components/hold-button.tsx';
import { m } from '../../paraglide/messages.js';
import { useTRPC } from '../../lib/trpc.ts';

function AgentCalls({ id }: { id: number }) {
  const trpc = useTRPC();
  const calls = useQuery(trpc.agents.calls.queryOptions({ id }));
  return (
    <div className="text-caption text-muted-foreground">
      <p>{m.agents_calls()}</p>
      {calls.data?.length ? (
        <ul>
          {calls.data.map((call) => (
            <li key={call.id}>{call.action}</li>
          ))}
        </ul>
      ) : (
        <p>{m.agents_no_calls()}</p>
      )}
    </div>
  );
}

export function AgentsSection({ enabled }: { enabled: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const agents = useQuery({ ...trpc.agents.list.queryOptions(), enabled });
  const create = useMutation(
    trpc.agents.create.mutationOptions({
      onSuccess: async () => {
        setName('');
        await queryClient.invalidateQueries({ queryKey: trpc.agents.list.queryKey() });
      },
    }),
  );
  const revoke = useMutation(
    trpc.agents.revoke.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.agents.list.queryKey() }),
    }),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) create.mutate({ name });
  }
  return (
    <section className="flex flex-col gap-md" aria-label={m.agents_title()}>
      <h2 className="text-title">{m.agents_title()}</h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-sm">
        <label className="flex flex-col gap-xs text-label">
          {m.agents_name()}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            className="min-h-touch rounded-md border border-border bg-background px-sm text-body"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-touch rounded-full bg-primary px-lg text-label text-primary-foreground disabled:opacity-60"
        >
          {m.agents_create()}
        </button>
      </form>
      {create.data && (
        <div className="flex flex-col gap-xs">
          <p className="text-caption text-muted-foreground">{m.agents_token_hint()}</p>
          <output aria-label={m.agents_token()} className="text-body break-all">
            {create.data.token}
          </output>
        </div>
      )}
      {agents.data?.length === 0 && <p className="text-caption text-muted-foreground">{m.agents_empty()}</p>}
      <ul className="flex flex-col gap-sm">
        {agents.data?.map((agent) => (
          <li key={agent.id} className="flex items-start justify-between gap-lg">
            <div className="flex flex-col gap-xs">
              <span className="text-label">{agent.name}</span>
              <AgentCalls id={agent.id} />
            </div>
            <HoldButton
              label={m.agents_revoke_hold({ name: agent.name })}
              idle={m.agents_revoke()}
              done={m.agents_revoked()}
              onConfirm={() => revoke.mutateAsync({ id: agent.id, confirmed: true })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
