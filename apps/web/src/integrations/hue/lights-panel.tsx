import { LightbulbIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { copy } from './copy.ts';
import { describeLight, useHue } from './use-hue.ts';

/** Small: state and the power button. Medium adds the brightness slider when the light has one. */
export function LightsPanel({ size }: { size: WidgetSize }) {
  const { state, setPower, setBrightness, connectionLost } = useHue();
  // The value under the thumb while dragging; the write goes out once, on release, not per pointer move.
  const [draft, setDraft] = useState<number | null>(null);
  const light = state.data;
  const ready = light?.availability === 'ready' && !connectionLost;
  const power = light?.capabilities.power ? light.power : null;
  const commit = () => {
    if (draft !== null) setBrightness.mutate({ percent: draft }, { onSettled: () => setDraft(null) });
  };

  return (
    <Panel
      title={copy.title}
      className={`h-full ${connectionLost || light?.availability === 'unavailable' ? 'opacity-60' : ''}`}
    >
      <p className="mt-auto text-heading break-words">{describeLight(light, connectionLost)}</p>
      <div className={size === 'small' ? 'flex flex-col gap-sm' : 'flex items-center gap-md'}>
        {light?.capabilities.power && (
          <div className="min-w-0 flex-1">
            <RegistryButton
              label={`${copy.power}: ${describeLight(light, connectionLost)}`}
              pressed={power === true}
              secondary={!power}
              iconOnly
              icon={
                <LightbulbIcon
                  className="size-icon"
                  aria-hidden
                  data-icon="lightbulb"
                  data-weight={power ? 'fill' : 'regular'}
                  weight={power ? 'fill' : 'regular'}
                />
              }
              action={() => setPower.mutateAsync({ on: !power })}
              disabled={!ready || power === null}
            />
          </div>
        )}
        {size !== 'small' && light?.capabilities.brightness && (
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={draft ?? light.brightnessPercent ?? 1}
            disabled={!ready || power !== true}
            aria-label={copy.brightness}
            aria-valuetext={`${draft ?? light.brightnessPercent ?? 1}%`}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            className="min-h-touch min-w-0 flex-1 accent-primary"
          />
        )}
      </div>
      {setPower.isError || setBrightness.isError ? (
        <p role="alert" className="text-caption text-danger">
          {copy.unknown}
        </p>
      ) : null}
    </Panel>
  );
}
