import { useMutation } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { ButtonGroup } from '../../components/ui/button-group.tsx';
import { useConnectionLost, useTRPC } from '../../lib/trpc.ts';
import { m } from '../../paraglide/messages.js';

/** The configured outputs as one switch: the fill sits on the active one and glides to the one picked. */
export function OutputSwitch({ className = '' }: { className?: string }) {
  const trpc = useTRPC();
  const audio = useSubscription(trpc.audio.onState.subscriptionOptions());
  const setOutput = useMutation(trpc.audio.setOutput.mutationOptions());
  const stale = useConnectionLost();
  if (!audio.data && !stale)
    return (
      <output
        aria-label={m.tile_loading()}
        className="h-2xl w-3xl rounded-md bg-muted-foreground/20 motion-safe:animate-pulse"
      />
    );
  if (!audio.data?.outputs.length) return null;
  const current = audio.data.current?.label;
  return (
    <div className={`flex flex-col items-start gap-xs ${className}`}>
      <ButtonGroup
        label={m.audio_outputs()}
        collapseLabels={false}
        items={audio.data.outputs.map((output) => ({
          id: output.label,
          label: output.label,
          active: output.label === current,
          disabled: !output.available || stale || setOutput.isPending,
          onClick: () => {
            if (output.label !== current) setOutput.mutate({ label: output.label });
          },
        }))}
      />
      {setOutput.isError && (
        <p role="alert" className="text-caption text-danger">
          {m.tile_error()}
        </p>
      )}
    </div>
  );
}
