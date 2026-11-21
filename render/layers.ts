// The static map (canvas `city`): land, water, parks, buildings, roads by class,
// street names. Redrawn only when the camera moves.
import type { Ctx2D, Frame } from '../app.contract.d.ts';
import type { World } from '../sim/types.ts';
import { glide, syncView, toScreen, toWorld } from './camera.ts';
import { FONT, MAP } from './theme.ts';

const ROAD_WIDTH = [18, 14, 10, 7];

function polygon(ctx: Ctx2D, w: World, pts: number[]) {
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = toScreen(w, pts[i], pts[i + 1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Grid cells under the screen (with a margin), for culling. */
function visibleCells(w: World, frame: Frame) {
  const g = w.city.grid;
  const [x0, y0] = toWorld(w, -40, -40);
  const [x1, y1] = toWorld(w, frame.width + 40, frame.height + 40);
  return {
    c0: Math.max(0, Math.floor(x0 / g.size) - 1), c1: Math.min(g.cols - 1, Math.floor(x1 / g.size) + 1),
    r0: Math.max(0, Math.floor(y0 / g.size) - 1), r1: Math.min(g.rows - 1, Math.floor(y1 / g.size) + 1),
  };
}

export function drawCity(w: World, ctx: Ctx2D, frame: Frame): boolean {
  syncView(w, frame);
  const moving = glide(w);
  const { city } = w;
  const z = w.cam.zoom;
  const g = city.grid;
  const cells = visibleCells(w, frame);

  ctx.fillStyle = MAP.bg;
  ctx.fillRect(0, 0, frame.width, frame.height);
  const [lx, ly] = toScreen(w, 0, 0);
  ctx.fillStyle = MAP.land;
  ctx.fillRect(lx, ly, city.width * z, city.height * z);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = MAP.park;
  ctx.beginPath();
  for (const p of city.file.parks) polygon(ctx, w, p);
  ctx.fill();
  ctx.fillStyle = MAP.water;
  ctx.strokeStyle = MAP.waterEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const p of city.file.water) polygon(ctx, w, p);
  ctx.fill();
  ctx.stroke();

  if (z > 0.14) {
    ctx.fillStyle = MAP.building;
    ctx.strokeStyle = MAP.buildingEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = cells.r0; r <= cells.r1; r++) {
      for (let c = cells.c0; c <= cells.c1; c++) {
        for (const i of g.buildings[r * g.cols + c]) polygon(ctx, w, city.file.buildings[i]);
      }
    }
    ctx.fill();
    if (z > 0.4) ctx.stroke();
  }

  const seen = new Set<number>();
  const visible: number[] = [];
  for (let r = cells.r0; r <= cells.r1; r++) {
    for (let c = cells.c0; c <= cells.c1; c++) {
      for (const i of g.edges[r * g.cols + c]) if (!seen.has(i)) { seen.add(i); visible.push(i); }
    }
  }
  for (let cls = 3; cls >= 0; cls--) {
    if (cls === 3 && z < 0.05) continue; // a whole commune at a glance: main roads only
    ctx.lineWidth = Math.max(cls === 0 ? 2 : 1, ROAD_WIDTH[cls] * z);
    ctx.strokeStyle = MAP.roads[cls];
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

  if (z > 0.5) drawStreetNames(w, ctx, visible);
  return moving;
}

function drawStreetNames(w: World, ctx: Ctx2D, visible: number[]) {
  const { city } = w;
  const z = w.cam.zoom;
  ctx.font = `500 ${Math.round(Math.min(11, 8.5 + z * 1.5))}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const done = new Set<number>();
  for (const i of visible) {
    const e = city.edges[i];
    if (e.len * z < 140 || done.has(e.name)) continue;
    done.add(e.name);
    const [ax, ay] = toScreen(w, city.nx[e.a], city.ny[e.a]);
    const [bx, by] = toScreen(w, city.nx[e.b], city.ny[e.b]);
    let angle = Math.atan2(by - ay, bx - ax);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    ctx.save();
    ctx.translate((ax + bx) / 2, (ay + by) / 2);
    ctx.rotate(angle);
    const label = (city.file.names[e.name] ?? '').toUpperCase();
    ctx.lineWidth = 3;
    ctx.strokeStyle = MAP.halo;
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = MAP.label;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}
