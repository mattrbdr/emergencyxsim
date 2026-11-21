// Draws the icon set (sim/catalog/icons.ts) on a canvas: SVG path data is
// parsed once into absolute moveTo / lineTo / bezierCurveTo / closePath commands
// (arcs converted to Béziers), then replayed at any position and size.
import type { Ctx2D } from '../app.contract.d.ts';
import { ICONS, type IconName } from '../sim/catalog/icons.ts';

type Cmd = [0, number, number] | [1, number, number] | [2, number, number, number, number, number, number] | [3];

const cache = new Map<string, Cmd[]>();

function tokens(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push(m[1] ?? Number(m[2]));
  return out;
}

/** Endpoint arc → cubic Béziers (SVG implementation notes, F.6). */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, phi: number, large: number, sweep: number, x2: number, y2: number): Cmd[] {
  if (rx === 0 || ry === 0) return [[1, x2, y2]];
  const s = Math.sin((phi * Math.PI) / 180), c = Math.cos((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry, cyp = (-coef * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  let t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const out: Cmd[] = [];
  const step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number) => [cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c];
  const dpt = (t: number) => [-rx * Math.sin(t) * c - ry * Math.cos(t) * s, -rx * Math.sin(t) * s + ry * Math.cos(t) * c];
  for (let i = 0; i < segs; i++) {
    const a = t1 + i * step, b = a + step;
    const [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dpt(a), [dbx, dby] = dpt(b);
    out.push([2, ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  t1 += dt;
  return out;
}

export function parsePath(d: string): Cmd[] {
  const hit = cache.get(d);
  if (hit) return hit;
  const t = tokens(d);
  const out: Cmd[] = [];
  let i = 0, cmd = 'M', x = 0, y = 0, sx = 0, sy = 0;
  const num = () => t[i++] as number;
  while (i < t.length) {
    if (typeof t[i] === 'string') cmd = t[i++] as string;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num(); y = oy + num(); sx = x; sy = y;
        out.push([0, x, y]);
        cmd = rel ? 'l' : 'L'; // further pairs are lines
        break;
      case 'L': x = ox + num(); y = oy + num(); out.push([1, x, y]); break;
      case 'H': x = (rel ? x : 0) + num(); out.push([1, x, y]); break;
      case 'V': y = (rel ? y : 0) + num(); out.push([1, x, y]); break;
      case 'C': {
        const a = ox + num(), b = oy + num(), c = ox + num(), e = oy + num();
        x = ox + num(); y = oy + num();
        out.push([2, a, b, c, e, x, y]);
        break;
      }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), large = num(), sweep = num();
        const nx = ox + num(), ny = oy + num();
        out.push(...arcToCubics(x, y, rx, ry, rot, large, sweep, nx, ny));
        x = nx; y = ny;
        break;
      }
      case 'Z': out.push([3]); x = sx; y = sy; break;
      default: i++; // unsupported command: skip a token
    }
  }
  cache.set(d, out);
  return out;
}

/** Strokes an icon centred on (x, y), `size` px wide. */
export function drawIcon(ctx: Ctx2D, name: IconName, x: number, y: number, size: number, color: string, weight = 1.75) {
  const s = size / 24;
  const ox = x - size / 2, oy = y - size / 2;
  ctx.beginPath();
  for (const c of parsePath(ICONS[name])) {
    if (c[0] === 0) ctx.moveTo(ox + c[1] * s, oy + c[2] * s);
    else if (c[0] === 1) ctx.lineTo(ox + c[1] * s, oy + c[2] * s);
    else if (c[0] === 2) ctx.bezierCurveTo(ox + c[1] * s, oy + c[2] * s, ox + c[3] * s, oy + c[4] * s, ox + c[5] * s, oy + c[6] * s);
    else ctx.closePath();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = weight * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
