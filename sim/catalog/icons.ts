// The game's own icon set: 24 × 24 grid, drawn as strokes (1.75 wide, round
// joins), using only M, L, C and Z so the same strings draw in Contract's `svg`
// and on the map canvas (render/sprites.ts). tools/gen-icons.ts copies them
// into ui/icons.contract.

const f = (n: number) => +n.toFixed(2);
/** A circle as four cubic Béziers. */
const circle = (cx: number, cy: number, r: number) => {
  const k = r * 0.5523;
  return `M${f(cx + r)} ${f(cy)}C${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)}` +
    `C${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}` +
    `C${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)}` +
    `C${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Z`;
};
const wheels = (a: number, b: number, y = 18, r = 1.8) => circle(a, y, r) + circle(b, y, r);

export const ICONS = {
  // ------------------------------------------------ buildings
  caserne: 'M3 21V9.5L12 4l9 5.5V21M3 21h18M7 21v-7h10v7M7 16.5h10M7 19h10M12 7.5v3',
  police: 'M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3zM9 12l2.2 2.2L15.5 10',
  hopital: 'M4 21V6h16v15M2.5 21h19M12 9v6M9 12h6M9.5 21v-3h5v3M4 6l2-2.5h12L20 6',
  // ------------------------------------------------ vehicles
  VSAV: `M2 17V8.5h11.5V17M13.5 10.5h4l3.5 3.5v3h-7.5M2 17h1.5M8 17h5.5M5.5 11v3.5M3.8 12.75h3.4${wheels(5.5, 17.5)}`,
  FPT: `M2 17V9h9v8M11 11h5.5l4.5 3v3h-10M2 17h1.8M8 17h3M3 7h8M3 7l1.5-2h5L11 7M5 11h3${wheels(5.5, 16.5)}`,
  EPA: `M2 17v-6h10v6M12 12h5l4 2.5V17h-9M2 17h1.8M8 17h4M4 11L17 3.5M6 11l12-7M8.2 9.7l1-1.7M11.2 8l1-1.7M14.2 6.2l1-1.6${wheels(5.5, 16.5)}`,
  VSR: `M2 17V8.5h12V17M14 10.5h3.5l3.5 3.5v3h-7M2 17h1.5M8 17h6M6 10.5l2.5 2.5M8.5 10.5L6 13M10.5 11v3${wheels(5.5, 17.5)}`,
  VTU: `M2 17V9.5h12.5V17M14.5 11h3l3.5 3v3h-6.5M2 17h1.5M8 17h6.5M5.5 12.2l3 1.6M6.2 11.2l1.6 3.3${wheels(5.5, 17.5)}`,
  FPTGP: `M1.5 17V7.5h11V17M12.5 10h5l5 4v3h-10M1.5 17h1.8M8 17h4.5M4 10.5h6M4 13h6${wheels(5.5, 17)}${circle(10, 18, 1.8)}`,
  VPMA: `M2 17V7.5h13V17M15 10.5h3l3 3V17h-6M2 17h1.5M8 17h7M5 13.5l3.5-4 3.5 4M5 13.5h7${wheels(5.5, 18)}`,
  AMB: `M2 17V8.5h12V17M14 10.5h3.5l3.5 3.5v3h-7M2 17h1.5M8 17h6M8 10v5M5.5 12.5h5${wheels(5.5, 17.5)}`,
  SMUR: `M2.5 16.5v-4l2.5-4h9l3 4h3v4M2.5 16.5h1.5M8.5 16.5h7M20.5 16.5h-1M8 6.5V4M7 5.25h2M5.5 12.5h12${wheels(6, 17.5)}`,
  PS: `M2.5 16.5v-4l2.5-4h10l3 4h3v4M2.5 16.5h1.5M8.5 16.5h7M20.5 16.5h-1M9 7V5h4v2M5.5 12.5h13${wheels(6, 17.5)}`,
  BAC: `M2.5 16.5v-4l2.5-4h10l3 4h3v4M2.5 16.5h1.5M8.5 16.5h7M20.5 16.5h-1M11 8.5l1-3 1 3M5.5 12.5h13${wheels(6, 17.5)}`,
  HELI: `M3 6h18M12 6v3M6 13.5c0-2.5 2-4.5 5-4.5h3c2.5 0 4 1.5 4 3.5v1.5H6zM18 13H22M22 11v4M8 18h9M9.5 15v3M15.5 15v3`,
  // ------------------------------------------------ call families
  feu: 'M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.4-5.4 3.6-8.4.9 1.6 1.6 2.6 2.6 3.2C12.6 7.6 13.6 5 15.6 3c.2 3.4 2.4 5.8 2.4 9.6 0 5-2.6 8.4-6 8.4zM12 21c-1.6 0-2.6-1.2-2.6-2.6 0-1.8 1.4-2.6 2.2-4.2 1 1.4 3 2.4 3 4.2 0 1.6-1.2 2.6-2.6 2.6z',
  sap: 'M2 12.5h4.5l2-4.5 3.5 9 2.5-6.5 1.5 2h6',
  route: 'M7 21L10 3M17 21L14 3M12 5v2.5M12 11v2.5M12 17v2.5M3 14l2.5-1M21 14l-2.5-1',
  // police family shares the badge
  technique: 'M14.5 4.5a4.5 4.5 0 00-5 6L3.5 16.5 7.5 20.5l6-6a4.5 4.5 0 006-5l-3 3-3-1-1-3z',
  // ------------------------------------------------ places
  bar: 'M6 4h12l-6 8zM12 12v7M8 20h8M8.5 7.5h7',
  ecole: 'M2.5 9L12 4.5 21.5 9 12 13.5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M21.5 9v6',
  stade: `M3 10c0-2.8 4-5 9-5s9 2.2 9 5v4c0 2.8-4 5-9 5s-9-2.2-9-5zM3 10c0 2.8 4 5 9 5s9-2.2 9-5M12 15v4`,
  ehpad: `${circle(9, 6, 2.2)}M9 9v6l-2.5 6M9 15l2.5 6M6 12h6M15 10v11M15 10h2.5`,
  gare: 'M6 3h12v12H6zM6 10h12M9 15l-3 6M15 15l3 6M8 18.5h8M9 6.5h6',
  // ------------------------------------------------ interface
  layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
  money: `${circle(9, 9, 6)}M15.2 9.6a6 6 0 11-5.6 5.6M7 9h3.5M7.5 7l1-0.3c1.5-.4 2.5.4 2.5.4M7.5 11l1 .3c1.5.4 2.5-.4 2.5-.4`,
  xp: 'M5 15l7-6 7 6M5 20l7-6 7 6M5 10l7-6 7 6',
  reputation: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  clock: `${circle(12, 12, 8.5)}M12 7v5l3.5 2`,
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15l12-7.5z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4.5 12.5l5 5L19.5 7',
  alert: 'M12 3.5L21.5 20h-19zM12 10v4.5M12 17v.5',
  target: `${circle(12, 12, 7)}M12 2v4M12 18v4M2 12h4M18 12h4`,
  build: 'M3 21h18M5 21V11l7-4 7 4v10M9 21v-5h6v5M12 3v4M10 4.5h4',
  shop: 'M4 7h16l-1.5 13h-13zM9 7V5.5C9 4 10.3 3 12 3s3 1 3 2.5V7M9 11v1M15 11v1',
  phone: 'M5 3.5h3.5l1.5 4.5-2.2 1.4c1 2.3 2.8 4.1 5.1 5.1l1.4-2.2 4.7 1.5v3.7c0 1-.8 1.5-1.8 1.5C9.8 19 5 14.2 3.5 6.3 3.5 5.2 4 3.5 5 3.5z',
  pin: `M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z${circle(12, 10, 2.3)}`,
  flag: 'M5 21V4M5 4h11l-2 3.5 2 3.5H5',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  log: 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 14.5h7M9 18h4',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 017 0v3M12 15v2.5',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  sell: 'M3 12l8-8h9v9l-8 8zM16 8v.5',
  level: 'M4 20h4v-5H4zM10 20h4V10h-4zM16 20h4V4h-4z',
  city: 'M3 21V10h5v11M8 21V4h8v17M16 21v-8h5v8M2 21h20M11 8h2M11 12h2M11 16h2',
  settings: `${circle(12, 12, 3)}M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1`,
  search: `${circle(10.5, 10.5, 6)}M15 15l5.5 5.5`,
  fleet: `M2 16V9h9v7M11 11h4l3 3v2h-7M2 16h18${circle(5.5, 17, 1.6)}${circle(15, 17, 1.6)}M5 6h9`,
  speed: 'M4 6l7 6-7 6zM13 6l7 6-7 6z',
  calls: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
} as const;

export type IconName = keyof typeof ICONS;
