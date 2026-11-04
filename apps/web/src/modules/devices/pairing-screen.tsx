import { useMutation } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { m } from '../../paraglide/messages.js';
import { replaceToken, useTRPC } from '../../lib/trpc.ts';
import { DeckFrame } from '../../shell/deck-frame.tsx';

const field = 'flex flex-col gap-xs text-label';
const input = 'rounded-md border border-border bg-surface p-md';

export function PairingScreen() {
  const trpc = useTRPC();
  // Storing the token is what swaps this screen for the tiles.
  const redeem = useMutation(trpc.pairing.redeem.mutationOptions({ onSuccess: ({ token }) => replaceToken(token) }));
  // The Home screen app on iOS does not share storage with Safari, so a token stored from Safari would be lost.
  const standalone = 'standalone' in navigator && navigator.standalone === true;

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
      <form onSubmit={submit} className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <h1 className="text-heading">{m.pairing_title()}</h1>
          <p className="text-body text-muted-foreground">{m.pairing_hint()}</p>
        </div>
        <label className={field}>
          {m.pairing_code()}
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            className={`${input} text-center text-display tabular-nums`}
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
          className="min-h-touch rounded-full bg-primary px-lg text-label text-primary-foreground disabled:opacity-60"
        >
          {redeem.isPending ? m.pairing_pending() : m.pairing_submit()}
        </button>
        {redeem.isError && (
          <p role="alert" className="text-caption text-danger">
            {errorText()}
          </p>
        )}
        {!standalone && <p className="text-caption text-muted-foreground">{m.pairing_not_standalone()}</p>}
      </form>
    </DeckFrame>
  );
}
