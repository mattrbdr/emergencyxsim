// Writes the game's sounds (assets/sounds/*.wav), synthesised here from sine
// waves, noise and envelopes: no recording, no licence.  bun tools/gen-sounds.ts [--check]
const RATE = 22050;

type Voice = (t: number) => number;
const sine = (f: number): Voice => (t) => Math.sin(2 * Math.PI * f * t);
/** A note: a voice shaped by a short attack and an exponential release. */
function note(v: Voice, start: number, length: number, gain = 0.5, attack = 0.01, decay = 6) {
  return (t: number) => {
    const u = t - start;
    if (u < 0 || u > length) return 0;
    const env = Math.min(1, u / attack) * Math.exp((-decay * u) / length);
    return v(u) * env * gain;
  };
}
// Deterministic noise (a radio's squelch).
let seed = 1;
const noise: Voice = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

function render(length: number, parts: ((t: number) => number)[]): Uint8Array {
  const n = Math.round(length * RATE);
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const s = parts.reduce((sum, p) => sum + p(t), 0);
    data[i] = Math.max(-1, Math.min(1, s)) * 32767 * 0.9;
  }
  const out = new Uint8Array(44 + n * 2);
  const view = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, n * 2, true);
  new Uint8Array(out.buffer, 44).set(new Uint8Array(data.buffer));
  return out;
}

const dual = (a: number, b: number): Voice => (t) => (sine(a)(t) + sine(b)(t)) / 2;
const SOUNDS: Record<string, () => Uint8Array> = {
  // A desk phone: two short double rings.
  appel: () => render(1.0, [note(dual(440, 480), 0, 0.35, 0.45, 0.01, 2), note(dual(440, 480), 0.5, 0.35, 0.45, 0.01, 2)]),
  // Priority 1: higher and faster, three times.
  appel_p1: () => render(0.9, [0, 0.28, 0.56].map((s) => note(dual(880, 960), s, 0.2, 0.42, 0.005, 2))),
  // Radio: a burst of squelch, then a short beep.
  radio: () => render(0.32, [note(noise, 0, 0.07, 0.18, 0.002, 3), note(sine(1250), 0.09, 0.16, 0.32, 0.005, 3)]),
  // Two-tone siren, discreet (435 / 488 Hz).
  depart: () => render(1.6, [0, 0.4, 0.8, 1.2].map((s, i) => note(sine(i % 2 ? 488 : 435), s, 0.4, 0.22, 0.02, 0.5))),
  // Crisis: three falling sweeps.
  crise: () => render(1.8, [0, 0.6, 1.2].map((s) => note((t) => Math.sin(2 * Math.PI * (900 * t - 350 * t * t)), s, 0.5, 0.4, 0.01, 1.5))),
  // Money in: two bright notes.
  gain: () => render(0.5, [note(sine(988), 0, 0.12, 0.35, 0.003, 4), note(sine(1319), 0.09, 0.35, 0.35, 0.003, 5)]),
  // Promotion: a rising arpeggio.
  promo: () => render(1.2, [523, 659, 784, 1047].map((f, i) => note(sine(f), i * 0.12, 0.6, 0.3, 0.005, 4))),
};

const check = process.argv.includes('--check');
let stale = 0;
for (const [name, make] of Object.entries(SOUNDS)) {
  seed = 1;
  const bytes = make();
  const file = new URL(`../assets/sounds/${name}.wav`, import.meta.url);
  if (check) {
    const old = (await Bun.file(file).exists()) ? new Uint8Array(await Bun.file(file).arrayBuffer()) : new Uint8Array();
    if (old.length !== bytes.length || old.some((b, i) => b !== bytes[i])) { console.error(`assets/sounds/${name}.wav is out of date: run bun tools/gen-sounds.ts`); stale++; }
  } else {
    await Bun.write(file, bytes);
  }
}
if (stale) process.exit(1);
if (!check) console.log(`assets/sounds: ${Object.keys(SOUNDS).length} sounds`);
