// The live layer (canvas `live`), every frame: stations and free sites, calls,
// routes and vehicles — vehicles interpolated between simulation ticks.
import type { Ctx2D, Frame } from '../app.contract.d.ts';
import { BUILDINGS, KIND_OF_POI } from '../sim/catalog/buildings.ts';
import type { IconName } from '../sim/catalog/icons.ts';
import { UNITS } from '../sim/catalog/units.ts';
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

  drawSites(w, ctx, now);
  for (const u of w.units) drawRoute(w, ctx, u, alpha, now, selected === `unit:${u.id}`);
  for (const b of w.buildings) drawBuilding(w, ctx, b, selected === `building:${b.id}`);
  for (const c of w.calls) if (c.state !== 'clos') drawCall(w, ctx, c, now, selected === `call:${c.id}`);
  drawUnits(w, ctx, alpha, now, selected);
  return true;
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
  const blink = !call.qualified && Math.floor(now / 450) % 2 === 0;
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
  ctx.fillText(working ? '··' : `P${call.priority}`, x, y + 0.5);
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
  const moving = u.status === 'route' || u.status === 'transport' || (u.status === 'retour' && selected);
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
    if (u.status === 'dispo' || u.status === 'hopital') continue;
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
