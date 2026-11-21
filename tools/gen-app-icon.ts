// Writes assets/icon.png (1024 px, opaque): the game's caserne glyph on its red.
//   bun tools/gen-app-icon.ts
import { deflateSync } from 'node:zlib';

const N = 1024, BG = [0xf2, 0x55, 0x5a], INK = [0x0b, 0x0e, 0x12];
// The caserne icon on its 24-unit grid (sim/catalog/icons.ts), as segments.
const LINES = [
  [[3, 21], [3, 9.5], [12, 4], [21, 9.5], [21, 21]], [[3, 21], [21, 21]],
  [[7, 21], [7, 14], [17, 14], [17, 21]], [[7, 16.5], [17, 16.5]], [[7, 19], [17, 19]], [[12, 7.5], [12, 10.5]],
];
const k = (0.65 * N) / 24, off = (4.2 * N) / 24, half = (1.6 * k) / 2;
const segs: number[][] = [];
for (const l of LINES) for (let i = 1; i < l.length; i++) segs.push([off + l[i - 1][0] * k, off + l[i - 1][1] * k, off + l[i][0] * k, off + l[i][1] * k]);
const dist = (px: number, py: number, [ax, ay, bx, by]: number[]) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const raw = Buffer.alloc(N * (N * 3 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 3 + 1)] = 0;
  for (let x = 0; x < N; x++) {
    const d = Math.min(...segs.map((s) => dist(x + 0.5, y + 0.5, s)));
    const a = Math.max(0, Math.min(1, half - d + 0.5)); // antialiased edge
    const o = y * (N * 3 + 1) + 1 + x * 3;
    for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] + (INK[c] - BG[c]) * a);
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
await Bun.write(new URL('../assets/icon.png', import.meta.url), png);
console.log('assets/icon.png 1024 px');
