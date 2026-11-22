// Touch, mouse and trackpad on the map: one finger pans (and flings); a double
// tap zooms in; tap-then-slide zooms with one finger; a wheel or trackpad pinch
// zooms; a tap picks what is under it (or places a building in build mode).
import { postAt } from '../sim/posting.ts';
import { nearestNode } from '../sim/city.ts';
import { withStationAt } from '../sim/coverage.ts';
import type { World } from '../sim/types.ts';
import { clamp, settle, toScreen, toWorld } from './camera.ts';

/** Pixels a finger may drift and still count as a tap (fingers are not mice). */
const TAP_SLOP = 10;
/** Two taps this close in time and space zoom in. */
const DOUBLE_TAP_MS = 320, DOUBLE_TAP_PX = 30;
let lastTap = { t: -1e9, x: 0, y: 0 };
/**
 * One-finger zoom, as in Apple Maps: tap, then touch again and slide down to
 * zoom in, up to zoom out (the hosts give a canvas one finger, so no pinch).
 */
let zoomDrag: { sx: number; sy: number; zoom: number; wx: number; wy: number; moved: boolean } | null = null;

/**
 * A pointer event on the map. `t` is the view's clock (ms), for the fling and
 * the double tap. Returns what a tap picked: "call:c3", "unit:u2",
 * "building:b1", "site:4", "built:b5", "posted:u2", "panned" after a drag, or "".
 */
export function pointer(w: World, kind: string, id: number, x: number, y: number, t = 0): string {
  const ps = w.pointers;
  // A tap on the phone's native scroll (it pans and zooms by itself): only what it picks.
  if (kind === 'tap') return pick(w, x, y);
  if (kind === 'down') {
    if (ps.size === 0 && t - lastTap.t < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < DOUBLE_TAP_PX) {
      const [wx, wy] = toWorld(w, x, y);
      zoomDrag = { sx: x, sy: y, zoom: w.cam.zoom, wx, wy, moved: false };
      lastTap = { t: -1e9, x: 0, y: 0 };
    }
    ps.set(id, { x, y, sx: x, sy: y, moved: false, t, vx: 0, vy: 0 });
    // A finger on the map stops any glide, and the city layer redraws live.
    w.cam.tx = w.cam.cx; w.cam.ty = w.cam.cy; w.cam.tz = w.cam.zoom;
    w.cam.touched = true;
    w.cam.seq++;
    if (ps.size >= 2) {
      const [a, b] = [...ps.values()];
      w.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: w.cam.zoom };
      for (const q of ps.values()) q.moved = true; // two fingers never tap
    }
    return '';
  }
  const p = ps.get(id);
  if (!p) return '';
  if (kind === 'move') {
    const dx = x - p.x, dy = y - p.y;
    const dt = Math.max(1, t - p.t);
    // Velocity in px/ms, smoothed, for the fling.
    p.vx = p.vx * 0.6 + (dx / dt) * 0.4;
    p.vy = p.vy * 0.6 + (dy / dt) * 0.4;
    p.x = x;
    p.y = y;
    p.t = t;
    if (Math.hypot(x - p.sx, y - p.sy) > TAP_SLOP) p.moved = true;
    if (zoomDrag && ps.size === 1) {
      if (p.moved) zoomDrag.moved = true;
      w.cam.zoom = zoomDrag.zoom * Math.exp((y - zoomDrag.sy) * 0.012);
      clamp(w);
      w.cam.cx = zoomDrag.wx - (zoomDrag.sx - w.view.w / 2) / w.cam.zoom;
      w.cam.cy = zoomDrag.wy - (zoomDrag.sy - w.view.h / 2) / w.cam.zoom;
    } else if (ps.size === 1 && p.moved) {
      w.cam.cx -= dx / w.cam.zoom;
      w.cam.cy -= dy / w.cam.zoom;
    } else if (ps.size >= 2 && w.pinch) {
      const [a, b] = [...ps.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const [wx, wy] = toWorld(w, mx, my);
      w.cam.zoom = w.pinch.zoom * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / w.pinch.d);
      clamp(w);
      const [nx, ny] = toWorld(w, mx, my);
      // Keep the point between the fingers under them, and follow them as they slide.
      w.cam.cx += wx - nx - dx / 2 / w.cam.zoom;
      w.cam.cy += wy - ny - dy / 2 / w.cam.zoom;
    }
    clamp(w);
    w.cam.tx = w.cam.cx; w.cam.ty = w.cam.cy; w.cam.tz = w.cam.zoom;
    return '';
  }
  // up (or a cancelled touch, which ends as an up)
  if (zoomDrag) {
    const z = zoomDrag;
    zoomDrag = null;
    ps.delete(id);
    if (!z.moved) {
      // A plain double tap: zoom in about the tapped point.
      w.cam.tz = w.cam.zoom * 2;
      clamp(w);
      w.cam.tx = z.wx - (z.sx - w.view.w / 2) / w.cam.tz;
      w.cam.ty = z.wy - (z.sy - w.view.h / 2) / w.cam.tz;
      clamp(w);
    }
    w.cam.seq++;
    return '';
  }
  const single = ps.size === 1;
  const tap = !p.moved && single;
  ps.delete(id);
  if (ps.size < 2) w.pinch = null;
  // The remaining finger of a pinch carries on panning from where it is.
  for (const q of ps.values()) { q.sx = q.x; q.sy = q.y; q.moved = true; }
  if (single && p.moved) {
    // Fling: the map keeps sliding a little in the direction of the swipe.
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 0.3 && t - p.t < 80) {
      w.cam.tx = w.cam.cx - (p.vx * 260) / w.cam.zoom;
      w.cam.ty = w.cam.cy - (p.vy * 260) / w.cam.zoom;
      clamp(w);
    }
    w.cam.seq++;
    return 'panned';
  }
  if (!tap) { w.cam.seq++; return ''; }
  const picked = pick(w, x, y);
  // A tap on empty map may be the first of a double tap (or of a one-finger zoom).
  lastTap = picked ? { t: -1e9, x: 0, y: 0 } : { t, x, y };
  return picked;
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
  // Prepositioning: the tap says where the vehicle waits.
  if (w.posting) {
    const id = w.posting;
    const [x, y] = toWorld(w, sx, sy);
    return postAt(w, nearestNode(w.city, x, y)) ? `posted:${id}` : '';
  }
  // Build mode: a free site of the right kind, else the road under the finger.
  if (w.placing) {
    const kind = w.placing.kind;
    const site = closest(w.city.pois.map((p, i) => ({ id: `site:${i}`, d: near(w, p.x, p.y, sx, sy) })), 24);
    if (site) return site;
    // First tap aims: the ghost stands on the nearest street and shows its gain.
    const [x, y] = toWorld(w, sx, sy);
    const node = nearestNode(w.city, x, y);
    const preview = withStationAt(w, node);
    w.placing = { kind, node, gain: preview.gain, after: preview.after };
    w.cam.seq++;
    return 'aimed';
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
