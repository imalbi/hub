import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, bytes: Buffer) {
  const type = Buffer.from(name);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([size, type, bytes, checksum]);
}

/** Original geometric fixture, not a real album cover. Recreate with Node, no image dependency. */
export function generateCover() {
  const side = 256;
  const pixels = Buffer.alloc((side * 3 + 1) * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const circle = (x - 128) ** 2 + (y - 128) ** 2 < 84 ** 2;
      const colour = circle ? (x < 128 ? [225, 118, 73] : [160, 192, 186]) : y < 128 ? [229, 217, 191] : [48, 58, 59];
      for (let channel = 0; channel < 3; channel++) pixels[y * (side * 3 + 1) + 1 + x * 3 + channel] = colour[channel];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
if (import.meta.main) writeFileSync(new URL('./cover.png', import.meta.url), generateCover());
