import { DeviceRow } from '../../components/device-row.tsx';
import { copy } from './copy.ts';
import { BrightnessSlider, PowerToggle, useLightControls } from './lights-panel.tsx';
import { describeLight } from './use-hue.ts';

/** The light in Dispositivi: state, power and, when the light has it, brightness. */
export function LightRow() {
  const controls = useLightControls();
  const { light, connectionLost, failed } = controls;
  return (
    <DeviceRow
      label={copy.title}
      state={describeLight(light, connectionLost)}
      stale={connectionLost || light?.availability === 'unavailable'}
      below={
        <>
          <BrightnessSlider {...controls} />
          {failed ? (
            <p role="alert" className="text-caption text-danger">
              {copy.unknown}
            </p>
          ) : null}
        </>
      }
    >
      <PowerToggle {...controls} />
    </DeviceRow>
  );
}
