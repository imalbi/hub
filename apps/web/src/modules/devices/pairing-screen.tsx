import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExportIcon, PlusSquareIcon } from '@phosphor-icons/react';
import type { FormEvent } from 'react';
import { m } from '../../paraglide/messages.js';
import { replaceToken, useTRPC } from '../../lib/trpc.ts';
import { DeckFrame } from '../../shell/deck-frame.tsx';

const field = 'flex flex-col gap-xs text-label';
const input = 'rounded-md border border-border bg-surface p-md';

export function PairingScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Storing the token is what swaps this screen for the tiles.
  const redeem = useMutation(
    trpc.pairing.redeem.mutationOptions({
      onSuccess: async ({ token }) => {
        await replaceToken(token);
        await queryClient.invalidateQueries();
      },
    }),
  );
  // The Home screen app on iOS does not share storage with Safari, so a token stored from Safari would be lost.
  const safari = 'standalone' in navigator && navigator.standalone === false;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = form.get('code');
    const deviceName = form.get('name');
    if (typeof code === 'string' && typeof deviceName === 'string') redeem.mutate({ code, deviceName });
  }

  function errorText() {
    const code = redeem.error?.data?.code;
    if (code === 'TOO_MANY_REQUESTS') return m.pairing_too_many();
    return code === 'BAD_REQUEST' ? m.pairing_wrong_code() : m.pairing_failed();
  }

  return (
    <DeckFrame>
      <div className="flex min-h-0 flex-col gap-lg overflow-y-auto">
        {safari && (
          <>
            <section className="flex flex-col gap-md">
              <h1 className="text-heading">{m.pairing_home_title()}</h1>
              <ol className="flex list-none flex-col gap-sm">
                {[m.pairing_home_share(), m.pairing_home_add(), m.pairing_home_open()].map((step, index) => (
                  <li key={step} className="flex items-center gap-sm">
                    <span
                      aria-hidden
                      className="flex size-icon-lg shrink-0 items-center justify-center rounded-full border border-border text-caption text-muted-foreground tabular-nums"
                    >
                      {index + 1}
                    </span>
                    <span className="text-body">{step}</span>
                    {index === 0 && (
                      <ExportIcon aria-hidden className="ml-auto size-icon shrink-0 text-muted-foreground" />
                    )}
                    {index === 1 && (
                      <PlusSquareIcon aria-hidden className="ml-auto size-icon shrink-0 text-muted-foreground" />
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <div className="border-t border-dashed border-border" />
            <p className="text-caption text-muted-foreground">{m.pairing_safari_hint()}</p>
          </>
        )}
        <form onSubmit={submit} className={`flex flex-col gap-lg ${safari ? 'opacity-60' : ''}`}>
          {!safari && (
            <div className="flex flex-col gap-xs">
              <h1 className="text-heading">{m.pairing_title()}</h1>
              <p className="text-body text-muted-foreground">{m.pairing_hint()}</p>
            </div>
          )}
          <label className={field}>
            {m.pairing_code()}
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className={`${input} text-body tracking-pairing-code tabular-nums`}
            />
          </label>
          <label className={field}>
            {m.pairing_name()}
            <input
              name="name"
              required
              maxLength={40}
              defaultValue={m.pairing_default_name()}
              className={`${input} text-body`}
            />
          </label>
          <button
            type="submit"
            disabled={redeem.isPending}
            className={`min-h-touch rounded-full px-lg text-label disabled:opacity-60 ${safari ? 'border border-foreground text-foreground' : 'bg-primary text-primary-foreground'}`}
          >
            {redeem.isPending ? m.pairing_pending() : m.pairing_submit()}
          </button>
          {redeem.isError && (
            <p role="alert" className="text-caption text-danger">
              {errorText()}
            </p>
          )}
        </form>
      </div>
    </DeckFrame>
  );
}
