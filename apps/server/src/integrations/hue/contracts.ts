import { z } from 'zod';

// HueBLE writes brightness as one byte and clamps it to 1..254 (there is no zero), so the public unit is percent.
const RAW_MIN = 1;
const RAW_MAX = 254;

export function percentToRaw(percent: number) {
  return Math.round(RAW_MIN + ((percent - 1) * (RAW_MAX - RAW_MIN)) / 99);
}

export function rawToPercent(raw: number) {
  return Math.min(100, Math.max(1, Math.round(1 + ((raw - RAW_MIN) * 99) / (RAW_MAX - RAW_MIN))));
}

const availability = z.enum(['connecting', 'ready', 'unavailable']);
const capabilities = z.object({ power: z.boolean(), brightness: z.boolean() });

/** What clients see. Values keep their last observed value while unavailable; no address, path or raw error. */
export const hueStateSchema = z.object({
  availability,
  power: z.boolean().nullable(),
  brightnessPercent: z.number().int().min(1).max(100).nullable(),
  model: z.string().nullable(),
  capabilities,
});
export type HueState = z.infer<typeof hueStateSchema>;

export const initialHueState: HueState = {
  availability: 'connecting',
  power: null,
  brightnessPercent: null,
  model: null,
  capabilities: { power: false, brightness: false },
};

export const setPowerInput = z.object({ on: z.boolean() });
export const setBrightnessInput = z.object({ percent: z.number().int().min(1).max(100) });
export const hueCommandSchema = z.discriminatedUnion('type', [
  setPowerInput.extend({ type: z.literal('setPower') }),
  setBrightnessInput.extend({ type: z.literal('setBrightness') }),
]);
export type HueCommand = z.infer<typeof hueCommandSchema>;
