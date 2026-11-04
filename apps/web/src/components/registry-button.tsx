import type { ReactNode } from 'react';
import { ActionButton } from './ui/action-button.tsx';
import { m } from '../paraglide/messages.js';

export function RegistryButton({
  label,
  action,
  disabled,
  icon,
  secondary = false,
  iconOnly = false,
  className = '',
}: {
  label: string;
  action: () => Promise<unknown>;
  disabled?: boolean;
  icon?: ReactNode;
  secondary?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <ActionButton
      action={action}
      aria-label={label}
      label={label}
      disabled={disabled}
      icon={icon}
      labels={{ idle: label, pending: m.action_pending(), success: m.action_done(), error: m.tile_error() }}
      variant={secondary ? 'outline' : 'primary'}
      className={`min-h-touch ${iconOnly ? 'media-transport min-w-touch' : ''} ${className}`}
    />
  );
}
