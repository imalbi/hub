import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Dialog } from '../components/ui/dialog.tsx';
import { HoldButton } from '../components/hold-button.tsx';
import { useTRPC } from '../lib/trpc.ts';
import { m } from '../paraglide/messages.js';

export function AgentConfirmation({ deck = false }: { deck?: boolean }) {
  const trpc = useTRPC();
  const pending = useSubscription(trpc.confirmations.onPending.subscriptionOptions()).data;
  const confirm = useMutation(trpc.confirmations.confirm.mutationOptions());
  const deny = useMutation(trpc.confirmations.deny.mutationOptions());
  const item = pending?.[0];
  if (!item) return null;
  const actions = (
    <>
      <button
        type="button"
        onClick={() => deny.mutate({ id: item.id })}
        className="min-h-touch rounded-full border border-border px-lg text-label"
      >
        {m.confirmation_deny()}
      </button>
      <HoldButton
        label={m.confirmation_confirm_hold()}
        idle={m.confirmation_confirm()}
        done={m.confirmation_confirmed()}
        onConfirm={() => confirm.mutateAsync({ id: item.id, confirmed: true })}
      />
    </>
  );
  const details = (
    <div className="flex min-w-0 flex-col gap-xs">
      <p className="text-label">{item.name}</p>
      <p className="text-caption text-muted-foreground">
        {m.confirmation_action()}: {item.action}
      </p>
      <pre className="max-h-32 overflow-auto text-caption break-all whitespace-pre-wrap">
        {m.confirmation_input()}: {JSON.stringify(item.input, null, 2)}
      </pre>
    </div>
  );
  if (deck)
    return (
      <aside
        aria-label={m.confirmation_title()}
        className="flex flex-col gap-sm rounded-lg border border-border bg-surface p-md"
      >
        <p className="text-label">{m.confirmation_title()}</p>
        {details}
        <div className="flex flex-wrap gap-sm">{actions}</div>
      </aside>
    );
  return (
    <Dialog
      open
      title={m.confirmation_title()}
      description={m.confirmation_hint()}
      closeLabel={m.confirmation_close()}
      onOpenChange={(open) => {
        if (!open) deny.mutate({ id: item.id });
      }}
      footer={actions}
    >
      {details}
    </Dialog>
  );
}
