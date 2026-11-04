import { writeFileSync } from 'node:fs';

/** Two soft bell tones a fifth apart, synthesised here so no third-party audio is in the repo. Mono 16-bit WAV. */
export function generateChime() {
  const rate = 44_100;
  const notes = [
    { hz: 880, at: 0 },
    { hz: 1318.5, at: 0.18 },
  ];
  const samples = new Int16Array(Math.round(rate * 1.2));
  for (const { hz, at } of notes) {
    const start = Math.round(at * rate);
    for (let i = 0; start + i < samples.length; i++) {
      const t = i / rate;
      // A 5 ms attack avoids a click; the exponential tail is what makes it a bell rather than a beep.
      const envelope = Math.min(1, t / 0.005) * Math.exp(-t * 5);
      const tone = Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(4 * Math.PI * hz * t);
      samples[start + i] = Math.max(-32_768, Math.min(32_767, (samples[start + i] ?? 0) + tone * envelope * 9000));
    }
  }
  const data = Buffer.from(samples.buffer);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

if (import.meta.main) writeFileSync(new URL('chime.wav', import.meta.url), generateChime());
