import { Link } from '@tanstack/react-router';
import { Readout } from '../../components/readout.tsx';
import { Ticks } from '../../components/ticks.tsx';
import { LightbulbIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Slider } from '../../components/ui/slider.tsx';
import type { WidgetSize } from '../../lib/widget-size.ts';
import { copy } from './copy.ts';
import { describeLight, useHue } from './use-hue.ts';

/** The light's state and the one write path for power and brightness, for the widget and the Dispositivi row. */
export function useLightControls() {
  const { state, setPower, setBrightness, connectionLost } = useHue();
  // The value under the thumb while dragging; the write goes out once, on release, not per pointer move.
  const [draft, setDraft] = useState<number | null>(null);
  const light = state.data;
  const commit = () => {
    if (draft !== null) setBrightness.mutate({ percent: draft }, { onSettled: () => setDraft(null) });
  };
  return {
    light,
    connectionLost,
    ready: light?.availability === 'ready' && !connectionLost,
    power: light?.capabilities.power ? light.power : null,
    draft,
    setDraft,
    commit,
    setPower,
    failed: setPower.isError || setBrightness.isError,
  };
}
type LightControls = ReturnType<typeof useLightControls>;

export function PowerToggle({ light, connectionLost, ready, power, setPower }: LightControls) {
  if (!light?.capabilities.power) return null;
  return (
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
  );
}

export function BrightnessSlider({ light, ready, power, draft, setDraft, commit }: LightControls) {
  if (!light?.capabilities.brightness) return null;
  return (
    <Slider
      label={copy.brightness}
      min={1}
      max={100}
      step={1}
      value={draft ?? light.brightnessPercent ?? 1}
      format={(v) => `${v}%`}
      disabled={!ready || power !== true}
      onValueChange={([val]) => setDraft(val)}
      onValueCommit={commit}
    />
  );
}

/** Small: state and the power button. Medium adds the brightness slider when the light has one. */
export function LightsPanel({ size }: { size: WidgetSize }) {
  const controls = useLightControls();
  const { light, connectionLost, failed } = controls;
  return (
    <Panel
      title={copy.title}
      // The state in the header and the figure once below (board I1): "Accesa, 100%" above "100%" said it twice.
      action={light?.power === true ? copy.on : describeLight(light, connectionLost)}
      className={`${size === 'small' ? 'relative h-full' : 'h-full'} ${connectionLost || light?.availability === 'unavailable' ? 'opacity-60' : ''}`}
    >
      {size === 'small' && (
        <Link
          to="/desk/devices"
          aria-label={copy.openDevices}
          className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-accent"
        />
      )}
      {size === 'small' ? (
        <div className="mt-auto flex min-w-0 items-end justify-between gap-sm">
          {light?.power === true && light.brightnessPercent !== null ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2xs">
              <p>
                <Readout>{light.brightnessPercent}%</Readout>
              </p>
              <Ticks value={Math.round(light.brightnessPercent / 20)} total={5} />
            </div>
          ) : (
            <span />
          )}
          {light?.capabilities.power && (
            <div className="relative z-10 shrink-0">
              <PowerToggle {...controls} />
            </div>
          )}
        </div>
      ) : (
        <>
          {light?.power === true && light.brightnessPercent !== null ? (
            <p className="mt-auto flex items-end justify-between gap-md">
              <Readout>{light.brightnessPercent}%</Readout>
              <Ticks value={Math.round(light.brightnessPercent / 20)} total={5} />
            </p>
          ) : (
            <span className="mt-auto" />
          )}
          <div className="flex items-center gap-md">
            {light?.capabilities.power && (
              <div className="min-w-0 flex-1">
                <PowerToggle {...controls} />
              </div>
            )}
            {light?.capabilities.brightness && (
              <div className="min-w-0 flex-1">
                <BrightnessSlider {...controls} />
              </div>
            )}
          </div>
        </>
      )}
      {failed ? (
        <p role="alert" className="text-caption text-danger">
          {copy.unknown}
        </p>
      ) : null}
    </Panel>
  );
}
