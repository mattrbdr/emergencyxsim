// The map camera: centre (metres), zoom (px per metre), glides toward a target.
import type { Frame } from '../app.contract.d.ts';
import type { World } from '../sim/types.ts';

export const fitZoom = (w: World) =>
  w.view.w > 0 ? Math.min(w.view.w / w.city.width, w.view.h / w.city.height) * 0.92 : 0.2;

const maxZoom = 3;

/** A zoomed-in view may not wander far past the city's edge. */
const clampAxis = (v: number, size: number, half: number) =>
  size > half * 2 ? Math.min(size - half * 0.3, Math.max(half * 0.3, v)) : Math.min(half, Math.max(size - half, v));

export function clamp(w: World) {
  const c = w.cam;
  const min = fitZoom(w) * 0.7;
  c.zoom = Math.min(maxZoom, Math.max(min, c.zoom));
  c.tz = Math.min(maxZoom, Math.max(min, c.tz));
  if (w.view.w === 0) return;
  c.cx = clampAxis(c.cx, w.city.width, w.view.w / 2 / c.zoom);
  c.cy = clampAxis(c.cy, w.city.height, w.view.h / 2 / c.zoom);
  c.tx = clampAxis(c.tx, w.city.width, w.view.w / 2 / c.tz);
  c.ty = clampAxis(c.ty, w.city.height, w.view.h / 2 / c.tz);
}

export const toScreen = (w: World, x: number, y: number): [number, number] => [
  (x - w.cam.cx) * w.cam.zoom + w.view.w / 2,
  (y - w.cam.cy) * w.cam.zoom + w.view.h / 2,
];
export const toWorld = (w: World, sx: number, sy: number): [number, number] => [
  (sx - w.view.w / 2) / w.cam.zoom + w.cam.cx,
  (sy - w.view.h / 2) / w.cam.zoom + w.cam.cy,
];

/** Called by each draw: follows the canvas size, frames the city until the player moves the map. */
export function syncView(w: World, frame: Frame) {
  if (w.view.w === frame.width && w.view.h === frame.height) return;
  w.view.w = frame.width;
  w.view.h = frame.height;
  if (!w.cam.touched) frameCity(w);
  clamp(w);
}

/** The whole city; on a phone (portrait), the band between the top bar and the drawer. */
export function frameCity(w: World) {
  const portrait = w.view.h > w.view.w;
  const z = portrait ? Math.max(w.view.w / w.city.width, (w.view.h * 0.5) / w.city.height) * 1.1 : fitZoom(w);
  w.cam.zoom = w.cam.tz = z;
  w.cam.cx = w.cam.tx = w.city.width / 2;
  // Centre the city in the band between the top bar (~50 px) and the drawer (~25 % of the height).
  w.cam.cy = w.cam.ty = w.city.height / 2 + (portrait ? (w.view.h * 0.125 - 25) / z : 0);
}

/** One step of the glide toward the target; true while still moving. */
export function glide(w: World): boolean {
  const c = w.cam;
  const moving = Math.abs(c.tx - c.cx) > 0.5 || Math.abs(c.ty - c.cy) > 0.5 || Math.abs(c.tz - c.zoom) > 0.0005;
  if (!moving) return false;
  c.cx += (c.tx - c.cx) * 0.2;
  c.cy += (c.ty - c.cy) * 0.2;
  c.zoom += (c.tz - c.zoom) * 0.2;
  clamp(w);
  return true;
}

function retarget(w: World) {
  w.cam.touched = true;
  clamp(w);
  w.cam.seq++;
}

/** Centres (x, y) in the part of the map the panels leave visible (insets in px). */
export function focus(w: World, x: number, y: number, inset: number[], zoom = 0.75) {
  const [left, right, top, bottom] = inset;
  w.cam.tz = Math.max(w.cam.zoom, zoom);
  w.cam.tx = x - (left - right) / 2 / w.cam.tz;
  w.cam.ty = y - (top - bottom) / 2 / w.cam.tz;
  retarget(w);
}

export function zoomBy(w: World, factor: number) {
  w.cam.tz = w.cam.zoom * factor;
  w.cam.tx = w.cam.cx;
  w.cam.ty = w.cam.cy;
  retarget(w);
}

export function overview(w: World) {
  w.cam.tx = w.city.width / 2;
  w.cam.ty = w.city.height / 2;
  w.cam.tz = fitZoom(w);
  w.cam.seq++;
}

/** After a direct manipulation (pan, pinch, wheel): no glide. */
export function settle(w: World) {
  w.cam.tx = w.cam.cx;
  w.cam.ty = w.cam.cy;
  w.cam.tz = w.cam.zoom;
  retarget(w);
}
