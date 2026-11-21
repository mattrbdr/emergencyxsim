// Short-lived marks over the live map (sim/fx.ts says what happened; this says
// how it looks): a ring where a call comes in, a flash on arrival, money rising,
// a stamp when a call closes, a radio bubble over a crew.
import type { Ctx2D } from '../app.contract.d.ts';
import type { Fx } from '../sim/fx.ts';
import type { World } from '../sim/types.ts';
import { toScreen } from './camera.ts';
import { FONT, MAP } from './theme.ts';

const LIFE: Record<Fx['kind'], number> = { ring: 1400, flash: 700, gain: 1800, stamp: 1800, bubble: 3200 };
const TONE = { good: '#3fb950', bad: '#f2555a', info: '#e6edf3', alert: '#f0a531' };
/** When each mark was first drawn, on the frame clock. */
const born = new Map<number, number>();

export function drawFx(w: World, ctx: Ctx2D, now: number) {
  const calm = !w.settings.motion;
  for (const f of w.fx) {
    if (!born.has(f.id)) born.set(f.id, now);
    const age = now - born.get(f.id)!;
    const life = LIFE[f.kind];
    if (age > life) continue;
    const k = age / life;
    let [x, y] = toScreen(w, f.x, f.y);
    if (f.unit) {
      const u = w.units.find((v) => v.id === f.unit);
      if (u) [x, y] = toScreen(w, u.x, u.y);
    }
    const color = TONE[f.tone];
    ctx.save();
    if (f.kind === 'ring' && !calm) {
      for (const lag of [0, 0.3]) {
        const q = Math.max(0, k - lag) / (1 - lag);
        if (q <= 0) continue;
        ctx.globalAlpha = (1 - q) * 0.9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 10 + q * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (f.kind === 'flash' && !calm) {
      ctx.globalAlpha = 1 - k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 34);
      g.addColorStop(0, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.kind === 'gain') {
      ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
      text(ctx, f.text, x, y - 26 - (calm ? 0 : k * 30), color, 700, 12);
    } else if (f.kind === 'stamp') {
      ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
      const s = calm ? 1 : 1 + Math.max(0, 0.25 - k) * 2;
      ctx.translate(x, y + 30);
      ctx.rotate(-0.12);
      ctx.scale(s, s);
      ctx.font = `700 11px ${FONT.mono}`;
      const wdt = ctx.measureText(f.text).width + 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(11,14,18,0.85)';
      ctx.fillRect(-wdt / 2, -9, wdt, 18);
      ctx.strokeRect(-wdt / 2, -9, wdt, 18);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, 0, 0.5);
    } else if (f.kind === 'bubble') {
      ctx.globalAlpha = k < 0.85 ? 1 : (1 - k) / 0.15;
      ctx.font = `600 10px ${FONT.mono}`;
      const wdt = ctx.measureText(f.text).width + 14;
      const bx = x - wdt / 2, by = y - 40;
      ctx.fillStyle = 'rgba(17,21,27,0.94)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + wdt, by);
      ctx.lineTo(bx + wdt, by + 20);
      ctx.lineTo(x + 5, by + 20);
      ctx.lineTo(x, by + 26);
      ctx.lineTo(x - 5, by + 20);
      ctx.lineTo(bx, by + 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = MAP.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, x, by + 10.5);
    }
    ctx.restore();
  }
  if (born.size > 200) for (const id of [...born.keys()]) if (!w.fx.some((f) => f.id === id)) born.delete(id);
}

function text(ctx: Ctx2D, s: string, x: number, y: number, color: string, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = MAP.halo;
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** Lights on a vehicle answering a call: alternating colours of its service. */
export function beacon(ctx: Ctx2D, x: number, y: number, service: string, now: number, calm: boolean) {
  const pair = service === 'police' ? ['#4c8dff', '#e6edf3'] : service === 'samu' ? ['#4c8dff', '#4c8dff'] : ['#f2555a', '#4c8dff'];
  const on = calm ? 0 : Math.floor(now / 180) % 2;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
  g.addColorStop(0, `${pair[on]}88`);
  g.addColorStop(1, `${pair[on]}00`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
