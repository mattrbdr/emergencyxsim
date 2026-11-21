// The city map, drawn on two Exact canvases from the data module:
// - `city`: the static layers (water, parks, buildings, roads, street names),
//   redrawn only when the camera moves;
// - `live`: stations, calls, routes and vehicles, every frame, vehicles
//   interpolated between simulation ticks.
import type { Ctx2D, Frame } from '../app.contract.d.ts';
import { UNIT_TYPES, type Service } from '../sim/catalog.ts';
import { edgeBetween } from '../sim/routing.ts';
import type { Call, Unit, World } from '../sim/world.ts';

export const COLORS = {
  bg: '#060a13',
  land: '#0a101c',
  water: '#0b2440',
  waterEdge: '#15406b',
  park: '#0c241b',
  parkEdge: '#123726',
  building: '#141d2f',
  buildingEdge: '#1c2840',
  casing: '#04070d',
  roads: ['#3a4a6b', '#2f3d5a', '#26324a', '#1f293d'],
  label: '#7f8fb0',
  service: { pompiers: '#ff453a', samu: '#30d158', police: '#0a84ff' } as Record<Service, string>,
  priority: ['#ff375f', '#ff375f', '#ff9f0a', '#ffd60a'],
  work: '#64d2ff',
};
const ROAD_WIDTH = [20, 15, 11, 8];

export const fitZoom = (w: World) =>
  w.view.w > 0 ? Math.min(w.view.w / w.city.width, w.view.h / w.city.height) * 0.92 : 0.2;

/** Keeps the city on screen: a zoomed-in view never shows much beyond its edge. */
const clampAxis = (v: number, size: number, half: number) =>
  size > half * 2 ? Math.min(size - half * 0.3, Math.max(half * 0.3, v)) : Math.min(half, Math.max(size - half, v));
const clampCam = (w: World) => {
  const c = w.cam;
  const fit = fitZoom(w);
  c.zoom = Math.min(3, Math.max(fit * 0.7, c.zoom));
  c.tz = Math.min(3, Math.max(fit * 0.7, c.tz));
  if (w.view.w === 0) return;
  c.cx = clampAxis(c.cx, w.city.width, w.view.w / 2 / c.zoom);
  c.cy = clampAxis(c.cy, w.city.height, w.view.h / 2 / c.zoom);
  c.tx = clampAxis(c.tx, w.city.width, w.view.w / 2 / c.tz);
  c.ty = clampAxis(c.ty, w.city.height, w.view.h / 2 / c.tz);
};

const toScreen = (w: World, x: number, y: number) => [
  (x - w.cam.cx) * w.cam.zoom + w.view.w / 2,
  (y - w.cam.cy) * w.cam.zoom + w.view.h / 2,
];
const toWorld = (w: World, sx: number, sy: number) => [
  (sx - w.view.w / 2) / w.cam.zoom + w.cam.cx,
  (sy - w.view.h / 2) / w.cam.zoom + w.cam.cy,
];

function setView(w: World, frame: Frame) {
  if (w.view.w !== frame.width || w.view.h !== frame.height) {
    const first = w.view.w === 0 || !w.camTouched;
    w.view.w = frame.width;
    w.view.h = frame.height;
    if (first) {
      // Portrait (a phone): fill the band between the shift bar and the drawer.
      const portrait = w.view.h > w.view.w;
      const z = portrait ? Math.max(w.view.w / w.city.width, (w.view.h * 0.36) / w.city.height) * 1.15 : fitZoom(w);
      w.cam.zoom = w.cam.tz = z;
      w.cam.cx = w.cam.tx = w.city.width / 2;
      w.cam.cy = w.cam.ty = w.city.height / 2 + (portrait ? (w.view.h * 0.21 - 40) / z : 0);
    }
    clampCam(w);
  }
}

function poly(ctx: Ctx2D, w: World, pts: number[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = toScreen(w, pts[i], pts[i + 1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- static layer

export function drawCity(w: World, ctx: Ctx2D, frame: Frame): boolean {
  setView(w, frame);
  // Glide towards a focus target (a call or unit chosen in the HUD).
  const c = w.cam;
  const moving = Math.abs(c.tx - c.cx) > 0.5 || Math.abs(c.ty - c.cy) > 0.5 || Math.abs(c.tz - c.zoom) > 0.0005;
  if (moving) {
    c.cx += (c.tx - c.cx) * 0.18;
    c.cy += (c.ty - c.cy) * 0.18;
    c.zoom += (c.tz - c.zoom) * 0.18;
    clampCam(w);
  }
  const { city } = w;
  const z = c.zoom;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, frame.width, frame.height);
  // Land: the city's extent.
  {
    const [x0, y0] = toScreen(w, 0, 0);
    ctx.fillStyle = COLORS.land;
    ctx.fillRect(x0, y0, city.width * z, city.height * z);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = COLORS.water;
  ctx.strokeStyle = COLORS.waterEdge;
  ctx.lineWidth = 1.5;
  for (const p of city.file.water) { poly(ctx, w, p); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = COLORS.park;
  ctx.strokeStyle = COLORS.parkEdge;
  ctx.lineWidth = 1;
  for (const p of city.file.parks) { poly(ctx, w, p); ctx.fill(); ctx.stroke(); }

  // Cull by grid cell.
  const [wx0, wy0] = toWorld(w, -40, -40);
  const [wx1, wy1] = toWorld(w, frame.width + 40, frame.height + 40);
  const g = city.grid;
  const c0 = Math.max(0, Math.floor(wx0 / g.size) - 1), c1 = Math.min(g.cols - 1, Math.floor(wx1 / g.size) + 1);
  const r0 = Math.max(0, Math.floor(wy0 / g.size) - 1), r1 = Math.min(g.rows - 1, Math.floor(wy1 / g.size) + 1);

  if (z > 0.14) {
    ctx.fillStyle = COLORS.building;
    ctx.strokeStyle = COLORS.buildingEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        for (const i of g.buildings[r * g.cols + col]) {
          const pts = city.file.buildings[i];
          for (let k = 0; k < pts.length; k += 2) {
            const [x, y] = toScreen(w, pts[k], pts[k + 1]);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
        }
      }
    }
    ctx.fill();
    if (z > 0.35) ctx.stroke();
  }

  const seen = new Set<number>();
  const visible: number[] = [];
  for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
    for (const i of g.edges[r * g.cols + col]) if (!seen.has(i)) { seen.add(i); visible.push(i); }
  }
  // Casing, then fill, by class from the smallest road up.
  for (const pass of [0, 1]) {
    for (let cls = 3; cls >= 0; cls--) {
      if (cls === 3 && z < 0.05) continue; // a whole commune at a glance: main roads only
      const width = Math.max(cls === 0 ? 2.2 : 1.2, ROAD_WIDTH[cls] * z);
      ctx.lineWidth = pass === 0 ? width + Math.max(1.5, width * 0.35) : width;
      ctx.strokeStyle = pass === 0 ? COLORS.casing : COLORS.roads[cls];
      ctx.beginPath();
      for (const i of visible) {
        const e = city.edges[i];
        if (e.cls !== cls) continue;
        const [ax, ay] = toScreen(w, city.nx[e.a], city.ny[e.a]);
        const [bx, by] = toScreen(w, city.nx[e.b], city.ny[e.b]);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
  }

  // Street names on long streets when zoomed in.
  if (z > 0.55) {
    ctx.font = `600 ${Math.round(Math.min(12, 9 + z * 2))}px -apple-system, system-ui, sans-serif`;
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const done = new Set<number>();
    for (const i of visible) {
      const e = city.edges[i];
      if (e.len * z < 150 || done.has(e.name)) continue;
      done.add(e.name);
      const [ax, ay] = toScreen(w, city.nx[e.a], city.ny[e.a]);
      const [bx, by] = toScreen(w, city.nx[e.b], city.ny[e.b]);
      let angle = Math.atan2(by - ay, bx - ax);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      ctx.save();
      ctx.translate((ax + bx) / 2, (ay + by) / 2);
      ctx.rotate(angle);
      ctx.fillText(city.file.names[e.name] ?? '', 0, 0);
      ctx.restore();
    }
  }
  return moving;
}

// ---------------------------------------------------------------- live layer

let lastSeq = -1;
let seqAt = 0;

export function drawLive(w: World, ctx: Ctx2D, frame: Frame, selected: string): boolean {
  setView(w, frame);
  if (w.seq !== lastSeq) { lastSeq = w.seq; seqAt = frame.time; }
  const tickMs = 250;
  const alpha = Math.min(1, (frame.time - seqAt) / tickMs);
  const now = frame.time;
  ctx.clearRect(0, 0, frame.width, frame.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const z = w.cam.zoom;

  // Routes of moving vehicles.
  for (const u of w.units) {
    if (u.status !== 'route' && u.status !== 'transport' && !(u.status === 'retour' && selected === `unit:${u.id}`)) continue;
    if (u.path.length < 2) continue;
    const color = COLORS.service[u.service];
    const [sx, sy] = unitScreen(w, u, alpha);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = u.status === 'retour' ? 0.35 : 0.85;
    ctx.lineWidth = selected === `unit:${u.id}` ? 4 : 2.5;
    ctx.setLineDash([2, 7]);
    ctx.lineDashOffset = -now / 40;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 1; i < u.path.length; i++) {
      const [x, y] = toScreen(w, w.city.nx[u.path[i]], w.city.ny[u.path[i]]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Stations with the count of vehicles at home.
  const home = new Map<number, number>();
  for (const u of w.units) if (u.status === 'dispo') home.set(u.station, (home.get(u.station) ?? 0) + 1);
  w.city.pois.forEach((p, i) => {
    const [x, y] = toScreen(w, p.x, p.y);
    const service: Service = p.kind === 'fire' ? 'pompiers' : p.kind === 'hospital' ? 'samu' : 'police';
    drawStation(ctx, x, y, service, p.kind, home.get(i) ?? 0, z > 0.3 ? p.name : '');
  });

  // Calls.
  for (const call of w.calls) {
    if (call.state === 'clos') continue;
    const [x, y] = toScreen(w, call.x, call.y);
    drawCall(ctx, w, call, x, y, now, selected === `call:${call.id}`);
  }

  // Vehicles: on scene ones fan out around their call.
  const scene = new Map<string, number>();
  for (const u of w.units) {
    if (u.status === 'dispo' || u.status === 'hopital') continue;
    let [x, y] = unitScreen(w, u, alpha);
    if (u.status === 'surplace') {
      const call = w.calls.find((c) => c.id === u.callId);
      if (call) {
        const k = scene.get(call.id) ?? 0;
        scene.set(call.id, k + 1);
        const [cx, cy] = toScreen(w, call.x, call.y);
        const a = -Math.PI / 2 + k * 1.1 + 0.6;
        x = cx + Math.cos(a) * 30;
        y = cy + Math.sin(a) * 30;
      }
    }
    drawUnit(ctx, u, x, y, now, selected === `unit:${u.id}`, z);
  }
  return true;
}

function unitScreen(w: World, u: Unit, alpha: number) {
  return toScreen(w, u.px + (u.x - u.px) * alpha, u.py + (u.y - u.py) * alpha);
}

function drawStation(ctx: Ctx2D, x: number, y: number, service: Service, kind: string, count: number, name: string) {
  const color = COLORS.service[service];
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#0d1424';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 15, y - 15, 30, 30, 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 11px -apple-system, system-ui, sans-serif';
  ctx.fillText(kind === 'fire' ? 'SP' : kind === 'hospital' ? 'H' : 'POL', x, y + 0.5);
  if (count > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 15, y - 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#04070d';
    ctx.font = '800 10px -apple-system, system-ui, sans-serif';
    ctx.fillText(String(count), x + 15, y - 14.5);
  }
  if (name) {
    ctx.font = '700 11px -apple-system, system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#04070d';
    ctx.strokeText(name, x, y + 27);
    ctx.fillStyle = '#c9d4ea';
    ctx.fillText(name, x, y + 27);
  }
}

function drawCall(ctx: Ctx2D, w: World, call: Call, x: number, y: number, now: number, selected: boolean) {
  const color = call.state === 'traitement' ? COLORS.work : COLORS.priority[call.priority];
  // Pulses: faster for priority 1, none once the scene is worked.
  if (call.state !== 'traitement') {
    const period = call.priority === 1 ? 900 : 1500;
    for (let k = 0; k < 2; k++) {
      const p = ((now + k * period / 2) % period) / period;
      ctx.beginPath();
      ctx.arc(x, y, 14 + p * 34, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Time left (or work progress) as a ring.
  const total = call.state === 'traitement' ? call.kind.work * 60 : call.deadline - call.at;
  const left = call.state === 'traitement' ? call.workLeft : call.deadline - w.t;
  const f = Math.max(0, Math.min(1, left / total));
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
  ctx.strokeStyle = color;
  ctx.stroke();
  // Disc and family glyph (unknown until qualified).
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  drawGlyph(ctx, call.qualified ? call.kind.family : '?', x, y);
  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = now / 60;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (!call.qualified && Math.floor(now / 400) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + 11, y - 11, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGlyph(ctx: Ctx2D, family: string, x: number, y: number) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (family === 'feu') {
    ctx.moveTo(x, y - 7);
    ctx.bezierCurveTo(x + 6, y - 2, x + 6, y + 6, x, y + 6);
    ctx.bezierCurveTo(x - 6, y + 6, x - 6, y - 1, x - 2, y - 3);
    ctx.bezierCurveTo(x - 1, y, x + 1, y + 1, x, y - 7);
    ctx.fill();
  } else if (family === 'sap') {
    ctx.fillRect(x - 1.8, y - 6, 3.6, 12);
    ctx.fillRect(x - 6, y - 1.8, 12, 3.6);
  } else if (family === 'police') {
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 6, y - 4.5);
    ctx.lineTo(x + 5, y + 2);
    ctx.lineTo(x, y + 7);
    ctx.lineTo(x - 5, y + 2);
    ctx.lineTo(x - 6, y - 4.5);
    ctx.closePath();
    ctx.fill();
  } else if (family === 'mixte') {
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 7, y + 6);
    ctx.lineTo(x - 7, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 0.9, y - 2.5, 1.8, 5);
  } else {
    ctx.font = '900 13px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + 0.5);
  }
}

function drawUnit(ctx: Ctx2D, u: Unit, x: number, y: number, now: number, selected: boolean, z: number) {
  const color = COLORS.service[u.service];
  const busy = u.status === 'route' || u.status === 'transport';
  ctx.save();
  if (busy) {
    // Light bar: alternating flashes.
    const on = Math.floor(now / 180) % 2 === 0;
    ctx.shadowColor = on ? (u.service === 'police' ? '#0a84ff' : '#ff453a') : '#5ac8fa';
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = u.status === 'retour' ? '#2a3245' : color;
  ctx.strokeStyle = selected ? '#ffffff' : '#04070d';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 13, y - 7.5, 26, 15, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (busy) {
    const on = Math.floor(now / 180) % 2 === 0;
    ctx.fillStyle = on ? '#ff3b30' : '#0a84ff';
    ctx.fillRect(x - 6, y - 10, 5, 2.5);
    ctx.fillStyle = on ? '#0a84ff' : '#ff3b30';
    ctx.fillRect(x + 1, y - 10, 5, 2.5);
  }
  ctx.fillStyle = u.status === 'retour' ? color : '#ffffff';
  ctx.font = `800 ${u.type.length > 3 ? 7.5 : 8.5}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(UNIT_TYPES[u.type].label, x, y + 0.5);
  if (selected || z > 0.9) {
    ctx.font = '700 10px -apple-system, system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#04070d';
    ctx.strokeText(u.name, x, y + 17);
    ctx.fillStyle = '#e5ecf8';
    ctx.fillText(u.name, x, y + 17);
  }
}

// ---------------------------------------------------------------- gestures

/** One pointer event on the map; returns what a tap picked ("call:c3", "unit:vsav2", "station:1" or ""). */
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
    p.x = x; p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > 6) p.moved = true;
    if (ps.size === 1 && p.moved) {
      w.cam.cx -= dx / w.cam.zoom;
      w.cam.cy -= dy / w.cam.zoom;
    } else if (ps.size === 2 && w.pinch) {
      const [a, b] = [...ps.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const [wx, wy] = toWorld(w, mx, my);
      w.cam.zoom = w.pinch.zoom * (d / w.pinch.d);
      clampCam(w);
      const [nx, ny] = toWorld(w, mx, my);
      w.cam.cx += wx - nx;
      w.cam.cy += wy - ny;
      w.cam.cx -= dx / 2 / w.cam.zoom;
      w.cam.cy -= dy / 2 / w.cam.zoom;
    }
    clampCam(w);
    syncTarget(w);
    return '';
  }
  // up
  const tap = !p.moved && ps.size === 1;
  ps.delete(id);
  if (ps.size < 2) w.pinch = null;
  return tap ? hit(w, x, y) : '';
}

export function wheel(w: World, dy: number, x: number, y: number) {
  const [wx, wy] = toWorld(w, x, y);
  w.cam.zoom *= Math.exp(-dy * 0.0018);
  clampCam(w);
  const [nx, ny] = toWorld(w, x, y);
  w.cam.cx += wx - nx;
  w.cam.cy += wy - ny;
  clampCam(w);
  syncTarget(w);
}

export function zoomBy(w: World, factor: number) {
  w.camTouched = true;
  w.cam.tz = w.cam.zoom * factor;
  w.cam.tx = w.cam.cx;
  w.cam.ty = w.cam.cy;
  clampCam(w);
  w.cam.seq++;
}

/** Centres (x, y) in the part of the map the panels leave visible (insets in px). */
export function focus(w: World, x: number, y: number, inset = [0, 0, 0, 0], zoom?: number) {
  w.camTouched = true;
  const [left, right, top, bottom] = inset;
  w.cam.tz = Math.max(w.cam.zoom, zoom ?? 0.75);
  w.cam.tx = x - (left - right) / 2 / w.cam.tz;
  w.cam.ty = y - (top - bottom) / 2 / w.cam.tz;
  clampCam(w);
  w.cam.seq++;
}

export function overview(w: World) {
  w.cam.tx = w.city.width / 2;
  w.cam.ty = w.city.height / 2;
  w.cam.tz = fitZoom(w);
  w.cam.seq++;
}

function syncTarget(w: World) {
  w.camTouched = true;
  w.cam.tx = w.cam.cx;
  w.cam.ty = w.cam.cy;
  w.cam.tz = w.cam.zoom;
  w.cam.seq++;
}

function hit(w: World, sx: number, sy: number): string {
  let best = '', bd = 26 * 26;
  for (const c of w.calls) {
    if (c.state === 'clos') continue;
    const [x, y] = toScreen(w, c.x, c.y);
    const d = (x - sx) ** 2 + (y - sy) ** 2;
    if (d < bd) { bd = d; best = `call:${c.id}`; }
  }
  if (best) return best;
  bd = 18 * 18;
  for (const u of w.units) {
    if (u.status === 'dispo' || u.status === 'hopital' || u.status === 'surplace') continue;
    const [x, y] = toScreen(w, u.x, u.y);
    const d = (x - sx) ** 2 + (y - sy) ** 2;
    if (d < bd) { bd = d; best = `unit:${u.id}`; }
  }
  if (best) return best;
  bd = 22 * 22;
  w.city.pois.forEach((p, i) => {
    const [x, y] = toScreen(w, p.x, p.y);
    const d = (x - sx) ** 2 + (y - sy) ** 2;
    if (d < bd) { bd = d; best = `station:${i}`; }
  });
  return best;
}

export { edgeBetween };
