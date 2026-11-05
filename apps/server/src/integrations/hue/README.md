# Hue Bluetooth light

Hub controls one Philips Hue Bluetooth light from this PC, with no Bridge, no cloud and no helper: only BlueZ, through
the `busctl` that systemd already provides, called with `ctx.run` like every other tool Hub wraps.

## How it works

- `bluez.ts` finds the paired Hue light (the paired device that lists the Hue GATT service), connects if needed,
  reads power, brightness and the model, and after every write reads the light back so the state is what it holds.
- It never pairs: a light BlueZ does not list as paired is left alone. With two paired Hue lights and no address it
  touches neither.
- Echo's changes are not pushed to the PC (a power-off never is), so while a client watches it refreshes every 5
  seconds. After a lost connection it retries at 1, 2, 5 then 30 seconds. A command queued before the loss is never
  replayed on the new connection.
- `module.ts` is the module (protected `state`, `onState`, `setPower`, `setBrightness`); `modules.example/hue/` is the
  same module on a fake light for the showcase and the e2e suite.

## Set up (owner)

1. Pair the light with the PC once, with the light discoverable (Hue app: Settings, Voice assistants, Make
   discoverable; the wording varies by app version): `bluetoothctl`, then `scan on`, `pair <address>`, `trust <address>`.
   The first pairing of this light was done with the HueBLE Python library's `connect()`, which answers the passkey
   confirmation itself; `bluetoothctl` has not been tried on it, so if it cannot pair, that is the fallback.
   Do not remove the pairing from the PC's Bluetooth settings afterwards; Hub needs it.
2. A private wiring in `modules.local/hue/` <!-- guard-private: allow Repository-local module directory -->
   made of `server.ts`, which calls `createConfiguredHue({ config, log, run })`, and `ui.tsx`,
   exports `hueUI` from `apps/web/src/integrations/hue/hue-ui.ts`.
3. Nothing in the config, unless two Hue lights are paired: then `modules.hue.address` names the one to use.
4. Rebuild the web app and restart the server.

## What the real light does (checked on a `LWA001`, firmware 1.163.5)

- Power and brightness only. Brightness is 1..254 on the wire, 1..100 percent in Hub; there is no zero.
- With the PC paired and connected, Echo kept answering.
- Brightness changes made through Echo reach the PC when it polls; a power-off made through Echo is not pushed at
  all, which is why it polls.
- The characteristics are the Hue service `932c32bd-0000-47a2-835a-a8d455b859dd`: power `…0002…`, brightness `…0003…`
  (one byte each) and the standard model number. They come from HueBLE's source and were read from the real light.
  The Hue protocol is unofficial: a firmware change could move them.

## Tests

`node --test apps/server/src/integrations/hue/*.test.ts`: the transport runs against `testing/fake-bluez.ts`, which
answers the exact `busctl` calls with the JSON the real tool prints, so no test touches the bus or the light.
`pnpm smoke` checks that `busctl` exists.
