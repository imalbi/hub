import { useState, type FormEvent, type ReactNode } from 'react';
import { CaretRightIcon, CopyIcon, DesktopIcon, TerminalWindowIcon } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HoldButton } from '../../components/hold-button.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { ActionButton } from '../../components/ui/action-button.tsx';
import { useTRPC } from '../../lib/trpc.ts';
import { useNow } from '../../lib/use-now.ts';
import { z } from '../../lib/zod-csp.ts';
import { m } from '../../paraglide/messages.js';
import { lastSeen } from './last-seen.ts';

const coreClientSchema = z.object({ mcp: z.object({ client: z.enum(['claude', 'codex']) }) });

// What a local agent needs: Hub always listens on loopback, whatever origin the page was opened from.
function mcpCommand(client: 'claude' | 'codex') {
  return client === 'codex'
    ? 'codex mcp add hub --url http://127.0.0.1:4180/mcp'
    : 'claude mcp add --scope user --transport http hub http://127.0.0.1:4180/mcp';
}

type Call = { id: number; action: string; createdAt: string };

/** One agent: icon, name, a line about its last call and its calls on demand; token agents also get Revoca. */
function AgentRow({
  name,
  icon,
  summary,
  calls,
  children,
}: {
  name: string;
  icon: ReactNode;
  summary: (last: Call | undefined, now: number) => string;
  calls: Call[] | undefined;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const now = useNow('clock');
  return (
    <li className="flex flex-col gap-sm border-t border-dashed border-border py-md">
      <div className="flex items-center gap-md">
        {icon}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-label">{name}</span>
          <span className="text-caption text-muted-foreground">{summary(calls?.[0], now)}</span>
        </div>
        <ActionButton
          variant="outline"
          className="min-h-touch"
          aria-label={m.agents_calls_of({ name })}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {m.agents_calls_show()}
        </ActionButton>
        {children}
      </div>
      {open && (
        <div className="text-caption text-muted-foreground">
          <p>{m.agents_calls()}</p>
          {calls?.length ? (
            <ul>
              {calls.map((call) => (
                <li key={call.id}>{call.action}</li>
              ))}
            </ul>
          ) : (
            <p>{m.agents_no_calls()}</p>
          )}
        </div>
      )}
    </li>
  );
}

export function LocalAgentRow() {
  const trpc = useTRPC();
  const calls = useQuery(trpc.agents.localCalls.queryOptions());
  const today = useQuery(trpc.agents.localCallsToday.queryOptions());
  return (
    <AgentRow
      name={m.agents_local()}
      icon={<DesktopIcon className="size-icon-lg shrink-0 text-muted-foreground" aria-hidden />}
      calls={calls.data}
      summary={(last, now) =>
        last
          ? m.agents_local_summary({
              count: today.data ?? 0,
              action: last.action,
              when: lastSeen(Date.parse(last.createdAt), now),
            })
          : m.agents_no_calls()
      }
    />
  );
}

export function TokenAgentRow({ id, name }: { id: number; name: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const calls = useQuery(trpc.agents.calls.queryOptions({ id }));
  const revoke = useMutation(
    trpc.agents.revoke.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.agents.list.queryKey() }),
    }),
  );
  return (
    <AgentRow
      name={name}
      icon={<TerminalWindowIcon className="size-icon-lg shrink-0 text-muted-foreground" aria-hidden />}
      calls={calls.data}
      summary={(last, now) =>
        last
          ? m.agents_token_last({ action: last.action, when: lastSeen(Date.parse(last.createdAt), now) })
          : m.agents_token_idle()
      }
    >
      <HoldButton
        label={m.agents_revoke_hold({ name })}
        idle={m.agents_revoke()}
        done={m.agents_revoked()}
        outline
        onConfirm={() => revoke.mutateAsync({ id, confirmed: true })}
      />
    </AgentRow>
  );
}

/** The token form for an agent on another machine: a name, a token shown once. */
function TokenForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation(
    trpc.agents.create.mutationOptions({
      onSuccess: async () => {
        setName('');
        await queryClient.invalidateQueries({ queryKey: trpc.agents.list.queryKey() });
      },
    }),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) create.mutate({ name });
  }
  return (
    <div className="flex flex-col gap-md pt-sm">
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
    </div>
  );
}

export function AgentsSection({ enabled }: { enabled: boolean }) {
  const trpc = useTRPC();
  const agents = useQuery({ ...trpc.agents.list.queryOptions(), enabled });
  const core = useQuery(trpc.settings.core.queryOptions());
  const command = core.data && mcpCommand(coreClientSchema.parse(core.data.value).mcp.client);
  return (
    <section className="flex flex-col gap-md" aria-label={m.agents_title()}>
      <h3 className="text-label text-muted-foreground">{m.agents_title()}</h3>
      {command && (
        <div className="flex items-center gap-md">
          <code aria-label={m.agents_command_label()} className="min-w-0 flex-1 truncate text-code text-label">
            {command}
          </code>
          <RegistryButton
            label={m.agents_copy()}
            icon={<CopyIcon className="size-icon" aria-hidden />}
            action={() => navigator.clipboard.writeText(command)}
          />
        </div>
      )}
      <ul className="flex flex-col">
        <LocalAgentRow />
        {agents.data?.map((agent) => (
          <TokenAgentRow key={agent.id} id={agent.id} name={agent.name} />
        ))}
      </ul>
      <details className="group border-t border-dashed border-border pt-sm">
        <summary className="flex min-h-touch cursor-pointer items-center gap-xs text-body text-muted-foreground">
          <CaretRightIcon className="size-icon-sm transition-transform group-open:rotate-90" aria-hidden />
          {m.agents_remote()}
        </summary>
        <TokenForm />
      </details>
    </section>
  );
}
