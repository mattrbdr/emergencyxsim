// Touch, mouse and trackpad on the map: one finger pans, two pinch, a wheel
// zooms, a tap picks what is under it (or places a building in build mode).
import { buildAt } from '../sim/buildings.ts';
import type { World } from '../sim/types.ts';
import { clamp, settle, toScreen, toWorld } from './camera.ts';

/** A tap's result: "call:c3", "unit:u2", "building:b1", "site:4", "built:b5" or "". */
export function pointer(w: World, kind: string, id: number, x: number, y: number): string {
  const ps = w.pointers;
  if (kind === 'down') {
    ps.set(id, { x, y, sx: x, sy: y, moved: false });
    if (ps.size === 2) {
      const [a, b] = [...ps.values()];
      w.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: w.cam.zoom };
    }
    return '';
  }
  const p = ps.get(id);
  if (!p) return '';
  if (kind === 'move') {
    const dx = x - p.x, dy = y - p.y;
    p.x = x;
    p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > 6) p.moved = true;
    if (ps.size === 1 && p.moved) {
      w.cam.cx -= dx / w.cam.zoom;
      w.cam.cy -= dy / w.cam.zoom;
    } else if (ps.size === 2 && w.pinch) {
      const [a, b] = [...ps.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const [wx, wy] = toWorld(w, mx, my);
      w.cam.zoom = w.pinch.zoom * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / w.pinch.d);
      clamp(w);
      const [nx, ny] = toWorld(w, mx, my);
      w.cam.cx += wx - nx - dx / 2 / w.cam.zoom;
      w.cam.cy += wy - ny - dy / 2 / w.cam.zoom;
    }
    clamp(w);
    settle(w);
    return '';
  }
  const tap = !p.moved && ps.size === 1;
  ps.delete(id);
  if (ps.size < 2) w.pinch = null;
  return tap ? pick(w, x, y) : '';
}

export function wheel(w: World, dy: number, x: number, y: number) {
  const [wx, wy] = toWorld(w, x, y);
  w.cam.zoom *= Math.exp(-dy * 0.0018);
  clamp(w);
  const [nx, ny] = toWorld(w, x, y);
  w.cam.cx += wx - nx;
  w.cam.cy += wy - ny;
  clamp(w);
  settle(w);
}

const near = (w: World, x: number, y: number, sx: number, sy: number) => {
  const [px, py] = toScreen(w, x, y);
  return (px - sx) ** 2 + (py - sy) ** 2;
};

function pick(w: World, sx: number, sy: number): string {
  // Build mode: a free site of the right kind, else the road under the finger.
  if (w.placing) {
    const kind = w.placing.kind;
    const site = closest(w.city.pois.map((p, i) => ({ id: `site:${i}`, d: near(w, p.x, p.y, sx, sy) })), 24);
    if (site) return site;
    const [x, y] = toWorld(w, sx, sy);
    const b = buildAt(w, kind, x, y);
    if (b) { w.placing = null; return `built:${b.id}`; }
    return '';
  }
  return (
    closest(w.calls.filter((c) => c.state !== 'clos').map((c) => ({ id: `call:${c.id}`, d: near(w, c.x, c.y, sx, sy) })), 26) ||
    closest(w.units.filter((u) => u.status === 'route' || u.status === 'transport' || u.status === 'retour')
      .map((u) => ({ id: `unit:${u.id}`, d: near(w, u.x, u.y, sx, sy) })), 20) ||
    closest(w.buildings.map((b) => ({ id: `building:${b.id}`, d: near(w, b.x, b.y, sx, sy) })), 24) ||
    closest(w.city.pois.map((p, i) => ({ id: `site:${i}`, d: near(w, p.x, p.y, sx, sy) }))
      .filter((s) => !w.buildings.some((b) => `site:${b.site}` === s.id)), 22)
  );
}

function closest(items: { id: string; d: number }[], radius: number): string {
  let best = '', bd = radius * radius;
  for (const it of items) if (it.d < bd) { bd = it.d; best = it.id; }
  return best;
}
