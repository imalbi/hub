import { ActionButton } from '../components/ui/action-button.tsx';
import { PasswordInput } from '../components/ui/password-input.tsx';
import { m } from '../paraglide/messages.js';
import { isObject } from './path.ts';

/**
 * A write-only value: the stored one never reaches the page. It shows "impostata" or "non impostata" and can only be
 * replaced; a string in `value` is a replacement being typed, `{ set: true }` is the stored one left alone.
 */
export function SecretField({
  label,
  value,
  saved,
  onChange,
}: {
  label: string;
  value: unknown;
  /** What the server sent, to put back when the replacement is dropped. */
  saved: unknown;
  onChange: (value: unknown) => void;
}) {
  if (typeof value === 'string')
    return (
      <div className="flex items-end gap-sm">
        <PasswordInput
          className="grow"
          label={label}
          aria-label={m.settings_secret_new({ name: label })}
          value={value}
          onValueChange={onChange}
          autoComplete="off"
          showLabel={m.settings_show()}
          hideLabel={m.settings_hide()}
          capsLockHint={m.settings_caps_lock()}
        />
        <ActionButton variant="outline" onClick={() => onChange(typeof saved === 'string' ? undefined : saved)}>
          {m.settings_secret_keep()}
        </ActionButton>
      </div>
    );
  const isSet = isObject(value) && value.set === true;
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-label text-muted-foreground">{label}</span>
      <div className="flex items-center gap-md">
        <span className="grow text-body">{isSet ? m.settings_secret_set() : m.settings_secret_unset()}</span>
        <ActionButton
          variant="outline"
          aria-label={`${m.settings_secret_replace()}: ${label}`}
          onClick={() => onChange('')}
        >
          {m.settings_secret_replace()}
        </ActionButton>
      </div>
    </div>
  );
}
