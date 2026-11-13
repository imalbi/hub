import { AirplayIcon } from '@phosphor-icons/react';
import { DeviceRow } from '../../components/device-row.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { copy } from './copy.ts';
import { useAirPlay } from './use-airplay.ts';

export function AirPlayRow() {
  const airplay = useAirPlay();
  if (!airplay.loaded) return null;
  return (
    <DeviceRow label={copy.title} state={airplay.text} stale={airplay.stale}>
      <RegistryButton
        label={`${copy.title}: ${airplay.text}`}
        pressed={airplay.running === true}
        secondary={!airplay.running}
        iconOnly
        icon={<AirplayIcon className="size-icon" aria-hidden />}
        action={airplay.toggle}
        disabled={airplay.stale}
      />
    </DeviceRow>
  );
}
