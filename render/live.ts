// The live layer (canvas `live`), every frame: stations and free sites, calls,
// routes and vehicles — vehicles interpolated between simulation ticks.
import type { Ctx2D, Frame } from '../app.contract.d.ts';
import { BUILDINGS, KIND_OF_POI } from '../sim/catalog/buildings.ts';
import type { IconName } from '../sim/catalog/icons.ts';
import { UNITS } from '../sim/catalog/units.ts';
import { siteOf } from '../sim/majors.ts';
import { shiftHour, today } from '../sim/weather.ts';
import type { Building, Call, Unit, World } from '../sim/types.ts';
import { syncView, toScreen } from './camera.ts';
import { drawIcon } from './sprites.ts';
import { FONT, MAP, PRIORITY, SERVICE, WORKING } from './theme.ts';

const TICK_MS = 250;
let lastSeq = -1;
let seqAt = 0;

export function drawLive(w: World, ctx: Ctx2D, frame: Frame, selected: string): boolean {
  syncView(w, frame);
  if (w.seq !== lastSeq) { lastSeq = w.seq; seqAt = frame.time; }
  const alpha = Math.min(1, (frame.time - seqAt) / TICK_MS);
  const now = frame.time;
  ctx.clearRect(0, 0, frame.width, frame.height);

  drawWeather(w, ctx, frame, now);
  drawMajorEffects(w, ctx, now, alpha);
  drawPerimeters(w, ctx, now);
  drawSites(w, ctx, now);
  for (const u of w.units) drawRoute(w, ctx, u, alpha, now, selected === `unit:${u.id}`);
  for (const b of w.buildings) drawBuilding(w, ctx, b, selected === `building:${b.id}`);
  for (const c of w.calls) if (c.state !== 'clos') drawCall(w, ctx, c, now, selected === `call:${c.id}`);
  drawUnits(w, ctx, alpha, now, selected);
  drawGhost(w, ctx, now);
  return true;
}

/** Major incidents: the cordon around the site, with its name. */
function drawPerimeters(w: World, ctx: Ctx2D, now: number) {
  for (const m of w.majors) {
    if (m.state !== 'actif' || (m.fugitive && !m.fugitive.stopped)) continue;
    const site = siteOf(m);
    const [x, y] = toScreen(w, site.x, site.y);
    // A search area widens with every minute the child is not found (up to 2.5×).
    const grow = m.kind.effect === 'search' ? 1 + Math.min(1.5, (w.t - m.startedAt) / 3600) : 1;
    const r = Math.max(28, m.kind.perimeter * grow * w.cam.zoom);
    ctx.save();
    ctx.fillStyle = 'rgba(242,85,90,0.07)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SERVICE.pompiers;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -now / 60;
    ctx.stroke();
    ctx.restore();
    label(ctx, `${m.kind.effect === 'search' ? 'ZONE DE RECHERCHE' : m.spot2 ? `SITE ${site === m.spot2 ? 2 : 1}` : 'PÉRIMÈTRE'} · ${m.kind.title.toUpperCase()}`, x, y - r - 10, SERVICE.pompiers);
  }
}

/** Night falls on the map, rain or snow over it, and the streets an event slows. */
function drawWeather(w: World, ctx: Ctx2D, frame: Frame, now: number) {
  const W = frame.width, H = frame.height;
  // Night: darker from 20 h, darkest 23 h – 5 h, light again by 7 h.
  const h = shiftHour(w.t);
  const night = h < 20 ? 0 : h < 23 ? (h - 20) / 3 : h < 29 ? 1 : Math.max(0, (31 - h) / 2);
  if (night > 0) {
    ctx.fillStyle = `rgba(3,6,14,${(0.32 * night).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // Streets slowed by the match, the market or roadworks.
  if (w.slowEdges.size) {
    const { city } = w;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,165,49,0.75)';
    ctx.lineWidth = Math.max(2, 6 * w.cam.zoom);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    for (const [i] of w.slowEdges) {
      if (city.edges[i].cls <= 1 && w.slowEdges.size > 60) continue; // holiday evenings: every main road, too much ink
      const e = city.edges[i];
      const [ax, ay] = toScreen(w, city.nx[e.a], city.ny[e.a]);
      const [bx, by] = toScreen(w, city.nx[e.b], city.ny[e.b]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.restore();
  }
  const kind = today(w).weather.id;
  if (kind === 'pluie' || kind === 'orage') {
    // Fine streaks falling, on a fixed pattern so the screen does not flicker.
    ctx.save();
    ctx.strokeStyle = kind === 'orage' ? 'rgba(160,190,230,0.22)' : 'rgba(160,190,230,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const n = Math.round((W * H) / (kind === 'orage' ? 5000 : 8000));
    for (let i = 0; i < n; i++) {
      const x = ((i * 7919) % W + now * 0.05) % W;
      const y = ((i * 104729) % H + now * 0.6 * (1 + (i % 3) * 0.2)) % H;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 9);
    }
    ctx.stroke();
    ctx.restore();
    // A storm lights the sky now and then.
    if (kind === 'orage' && (now % 9000) < 90) {
      ctx.fillStyle = 'rgba(220,230,255,0.10)';
      ctx.fillRect(0, 0, W, H);
    }
  } else if (kind === 'neige') {
    ctx.save();
    ctx.fillStyle = 'rgba(235,240,250,0.55)';
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      const y = ((i * 104729) % H + now * 0.04 * (1 + (i % 4) * 0.25)) % H;
      const x = ((i * 7919) % W + Math.sin(now / 1200 + i) * 12 + W) % W;
      ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1.5, i % 3 === 0 ? 2 : 1.5);
    }
    ctx.restore();
  } else if (kind === 'canicule') {
    ctx.fillStyle = 'rgba(240,140,40,0.05)';
    ctx.fillRect(0, 0, W, H);
  }
}

/** Special effects of a major: flooded streets, the toxic plume, the vehicle on the run. */
function drawMajorEffects(w: World, ctx: Ctx2D, now: number, alpha: number) {
  const m = w.majors.find((x) => x.state === 'actif');
  if (!m) return;
  const { city } = w;
  if (w.blocked.size) {
    ctx.save();
    ctx.strokeStyle = 'rgba(88,166,255,0.85)';
    ctx.lineWidth = Math.max(3, 9 * w.cam.zoom);
    ctx.lineCap = 'round';
    ctx.setLineDash([2, 5]);
    ctx.lineDashOffset = -now / 90;
    ctx.beginPath();
    for (const i of w.blocked) {
      const e = city.edges[i];
      const [ax, ay] = toScreen(w, city.nx[e.a], city.ny[e.a]);
      const [bx, by] = toScreen(w, city.nx[e.b], city.ny[e.b]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.restore();
    const [x, y] = toScreen(w, m.spot.x, m.spot.y);
    label(ctx, 'RUES INONDÉES', x, y + Math.max(40, 380 * w.cam.zoom), '#58a6ff');
  }
  if (m.kind.effect === 'plume') {
    const [x, y] = toScreen(w, m.spot.x, m.spot.y);
    const reach = Math.max(90, 900 * w.cam.zoom);
    const spread = 0.42 + 0.03 * Math.sin(now / 700);
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, reach);
    g.addColorStop(0, 'rgba(210,153,34,0.38)');
    g.addColorStop(1, 'rgba(210,153,34,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, reach, m.wind - spread, m.wind + spread);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label(ctx, 'PANACHE TOXIQUE · VENT', x + Math.cos(m.wind) * reach * 0.6, y + Math.sin(m.wind) * reach * 0.6, '#d29922');
  }
  const f = m.fugitive;
  if (f) {
    const [x, y] = toScreen(w, f.px + (f.x - f.px) * alpha, f.py + (f.y - f.py) * alpha);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(f.heading);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, -7);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = f.stopped ? MAP.muted : '#f0f6fc';
    ctx.fill();
    ctx.strokeStyle = SERVICE.police;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (!f.stopped) {
      ctx.save();
      ctx.strokeStyle = SERVICE.police;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 150);
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    label(ctx, f.stopped ? 'FUYARD INTERCEPTÉ' : 'FUYARD', x, y + 30, f.stopped ? MAP.muted : '#f0f6fc');
  }
}

/** Build mode: the building being aimed at, and what it adds. */
function drawGhost(w: World, ctx: Ctx2D, now: number) {
  const p = w.placing;
  if (!p || p.node < 0) return;
  const [x, y] = toScreen(w, w.city.nx[p.node], w.city.ny[p.node]);
  const color = SERVICE[BUILDINGS[p.kind].service];
  ctx.save();
  ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 180);
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(11,14,18,0.85)';
  ctx.beginPath();
  ctx.rect(x - 16, y - 16, 32, 32);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  drawIcon(ctx, p.kind as IconName, x, y, 20, color, 2);
  label(ctx, `+${Math.round(p.gain * 100)} % COUVERTURE`, x, y + 28, '#3fb950');
}

// ---------------------------------------------------------------- stations

function drawBuilding(w: World, ctx: Ctx2D, b: Building, selected: boolean) {
  const [x, y] = toScreen(w, b.x, b.y);
  const color = SERVICE[BUILDINGS[b.kind].service];
  const home = w.units.filter((u) => u.building === b.id && u.status === 'dispo').length;
  ctx.fillStyle = '#151a21';
  ctx.strokeStyle = selected ? MAP.ink : color;
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.beginPath();
  ctx.rect(x - 14, y - 14, 28, 28);
  ctx.fill();
  ctx.stroke();
  drawIcon(ctx, b.kind as IconName, x, y, 18, color, 2);
  // Vehicles at home: a tab on the corner.
  ctx.fillStyle = color;
  ctx.fillRect(x + 8, y - 20, 14, 12);
  ctx.fillStyle = '#0b0e12';
  ctx.font = `600 9px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(home), x + 15, y - 13.5);
  if (w.cam.zoom > 0.3 || selected) label(ctx, b.name.toUpperCase(), x, y + 24, MAP.ink);
}

function drawSites(w: World, ctx: Ctx2D, now: number) {
  w.city.pois.forEach((p, i) => {
    if (w.buildings.some((b) => b.site === i)) return;
    const kind = KIND_OF_POI[p.kind];
    const def = BUILDINGS[kind];
    const open = def.level <= w.level;
    const wanted = w.placing?.kind === kind && open;
    const [x, y] = toScreen(w, p.x, p.y);
    const color = open ? SERVICE[def.service] : MAP.muted;
    ctx.save();
    ctx.globalAlpha = wanted ? 0.6 + 0.4 * Math.sin(now / 200) : open ? 0.75 : 0.35;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.fillStyle = 'rgba(11,14,18,0.8)';
    ctx.beginPath();
    ctx.rect(x - 12, y - 12, 24, 24);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    drawIcon(ctx, open ? (kind as IconName) : 'lock', x, y, 15, color, 1.75);
    ctx.restore();
    if (w.cam.zoom > 0.45 || wanted) label(ctx, p.name.toUpperCase(), x, y + 21, MAP.muted);
  });
}

// ---------------------------------------------------------------- calls

function drawCall(w: World, ctx: Ctx2D, call: Call, now: number, selected: boolean) {
  const [x, y] = toScreen(w, call.x, call.y);
  const working = call.state === 'traitement';
  const color = working ? WORKING : PRIORITY[call.priority];
  const total = working ? call.kind.work * 60 : call.deadline - call.at;
  const left = working ? call.workLeft : call.deadline - w.t;
  const f = Math.max(0, Math.min(1, left / total));
  // An unanswered P1 blinks its outline.
  const deciding = call.state === 'bilan';
  const blink = (!call.qualified || deciding) && Math.floor(now / 450) % 2 === 0;
  const r = 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.fillRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44);
  if (blink || selected) {
    ctx.strokeStyle = selected ? MAP.ink : color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-r * 1.05, -r * 1.05, r * 2.1, r * 2.1);
  }
  ctx.restore();
  ctx.fillStyle = '#0b0e12';
  ctx.font = `700 10px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(deciding ? '!' : working ? '··' : `P${call.priority}`, x, y + 0.5);
  // Time left: a bar under the diamond.
  ctx.fillStyle = 'rgba(230,237,243,0.15)';
  ctx.fillRect(x - 14, y + 16, 28, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x - 14, y + 16, 28 * f, 3);
  if (call.qualified) drawIcon(ctx, (call.kind.family === 'police' ? 'police' : call.kind.family) as IconName, x + 20, y - 12, 14, color, 2);
  if (selected) label(ctx, call.address.toUpperCase(), x, y + 30, MAP.ink);
}

// ---------------------------------------------------------------- vehicles

function position(u: Unit, alpha: number) {
  return [u.px + (u.x - u.px) * alpha, u.py + (u.y - u.py) * alpha];
}

function drawRoute(w: World, ctx: Ctx2D, u: Unit, alpha: number, now: number, selected: boolean) {
  const moving = u.status === 'route' || u.status === 'transport' || (u.status === 'poste' && u.path.length > 1) || (u.status === 'retour' && selected);
  if (!moving) return;
  const [wx, wy] = position(u, alpha);
  const [sx, sy] = toScreen(w, wx, wy);
  ctx.save();
  ctx.strokeStyle = SERVICE[u.service];
  ctx.globalAlpha = u.status === 'retour' ? 0.35 : 0.9;
  ctx.lineWidth = selected ? 3 : 2;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -now / 30;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  if (u.flight) {
    const [tx, ty] = toScreen(w, u.flight.x, u.flight.y);
    ctx.lineTo(tx, ty);
  } else {
    for (let i = 1; i < u.path.length; i++) {
      const [x, y] = toScreen(w, w.city.nx[u.path[i]], w.city.ny[u.path[i]]);
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawUnits(w: World, ctx: Ctx2D, alpha: number, now: number, selected: string) {
  const scene = new Map<string, number>();
  for (const u of w.units) {
    if (u.status === 'dispo' || u.status === 'hopital' || u.status === 'repos' || u.status === 'atelier') continue;
    let [wx, wy] = position(u, alpha);
    let [x, y] = toScreen(w, wx, wy);
    let heading = u.heading;
    if (u.status === 'surplace') {
      const call = w.calls.find((c) => c.id === u.callId);
      if (call) {
        const k = scene.get(call.id) ?? 0;
        scene.set(call.id, k + 1);
        const [cx, cy] = toScreen(w, call.x, call.y);
        const a = -Math.PI * 0.75 + k * 0.9;
        x = cx + Math.cos(a) * 32;
        y = cy + Math.sin(a) * 32;
        heading = a + Math.PI;
      }
    }
    drawVehicle(ctx, u, x, y, heading, now, selected === `unit:${u.id}`, w.cam.zoom);
  }
}

function drawVehicle(ctx: Ctx2D, u: Unit, x: number, y: number, heading: number, now: number, selected: boolean, z: number) {
  const color = u.status === 'retour' ? MAP.muted : SERVICE[u.service];
  const busy = u.status === 'route' || u.status === 'transport';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  // A chevron pointing where it drives.
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, -6.5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 6.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = selected ? MAP.ink : '#0b0e12';
  ctx.lineWidth = selected ? 2 : 1.25;
  ctx.stroke();
  ctx.restore();
  if (busy && Math.floor(now / 220) % 2 === 0) {
    ctx.fillStyle = u.service === 'police' ? '#7fb0ff' : '#ffffff';
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  if (z > 0.35 || selected) {
    const text = UNITS[u.type].label + u.name.slice(UNITS[u.type].label.length);
    ctx.font = `600 9px ${FONT.mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(11,14,18,0.85)';
    ctx.fillRect(x + 10, y - 7, width, 13);
    ctx.fillStyle = color;
    ctx.fillRect(x + 10, y - 7, 2, 13);
    ctx.fillStyle = MAP.ink;
    ctx.fillText(text, x + 14, y);
  }
}

function label(ctx: Ctx2D, text: string, x: number, y: number, color: string) {
  ctx.font = `600 9.5px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = MAP.halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
