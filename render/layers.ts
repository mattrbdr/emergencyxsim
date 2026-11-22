// The static map (canvas `city`): land, water, parks, buildings, roads by class,
// street names. Redrawn only when the camera moves.
import type { Ctx2D, Frame } from '../app.contract.d.ts';
import { HOTSPOT_LABEL, ZONE_LABEL } from '../sim/catalog/places.ts';
import type { IconName } from '../sim/catalog/icons.ts';
import { coverageTimes, SLOW, TARGET, withStationAt } from '../sim/coverage.ts';
import type { World } from '../sim/types.ts';
import { drawIcon } from './sprites.ts';
import { glide, syncView, toScreen, toWorld } from './camera.ts';
import { COVERAGE, FONT, MAP, ZONE_TINT } from './theme.ts';

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

export function drawCity(w: World, ctx: Ctx2D, frame: Frame, night = 0): boolean {
  syncView(w, frame);
  // While a finger is on the map or the view glides, redraw every frame from the
  // camera as it is now, with the finer details left out to keep it fluid.
  const moving = w.scrollZ0 > 0 ? false : glide(w) || w.pointers.size > 0;
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
  for (const z of city.zones) {
    ctx.fillStyle = ZONE_TINT[z.kind];
    ctx.beginPath();
    polygon(ctx, w, z.pts);
    ctx.fill();
  }
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
    if (z > 0.4 && !moving) ctx.stroke();
  }

  const seen = new Set<number>();
  const visible: number[] = [];
  for (let r = cells.r0; r <= cells.r1; r++) {
    for (let c = cells.c0; c <= cells.c1; c++) {
      for (const i of g.edges[r * g.cols + c]) if (!seen.has(i)) { seen.add(i); visible.push(i); }
    }
  }
  const times = w.overlay ? overlayTimes(w) : null;
  const bands = times ? [COVERAGE.far, COVERAGE.slow, COVERAGE.fast] : [''];
  // Main roads get a dark casing first, so they read as roads above the blocks.
  if (!times) {
    ctx.strokeStyle = MAP.casing;
    for (const cls of [1, 0]) {
      ctx.lineWidth = Math.max(cls === 0 ? 2 : 1, ROAD_WIDTH[cls] * z) + 2.5;
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
  for (let cls = 3; cls >= 0; cls--) for (const band of bands) {
    if (cls === 3 && z < 0.05) continue; // a whole commune at a glance: main roads only
    // Lanes and small streets fade out as the view widens.
    ctx.globalAlpha = times || cls < 2 ? 1 : Math.max(0.35, Math.min(1, (z - 0.05) / 0.25));
    ctx.lineWidth = Math.max(cls === 0 ? 2 : times ? 1.5 : 1, ROAD_WIDTH[cls] * z);
    ctx.strokeStyle = band || MAP.roads[cls];
    ctx.beginPath();
    for (const i of visible) {
      const e = city.edges[i];
      if (e.cls !== cls) continue;
      if (times && bandOf(Math.min(times[e.a], times[e.b])) !== band) continue;
      const [ax, ay] = toScreen(w, city.nx[e.a], city.ny[e.a]);
      const [bx, by] = toScreen(w, city.nx[e.b], city.ny[e.b]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Night: the town darkens, then its windows light up.
  if (night > 0) {
    ctx.fillStyle = `rgba(3,6,14,${(0.34 * night).toFixed(3)})`;
    ctx.fillRect(0, 0, frame.width, frame.height);
    if (z > 0.14 && !moving) drawWindows(w, ctx, cells, night);
  }
  if (z > 0.5 && !moving) drawStreetNames(w, ctx, visible);
  drawPlaces(w, ctx);
  return moving;
}

// ---------------------------------------------------------------- coverage

let previewNode = -1;
let previewTimes: Float64Array | null = null;

/** Station times, including the building being aimed at in build mode. */
function overlayTimes(w: World): Float64Array {
  const node = w.placing?.node ?? -1;
  if (node < 0) return coverageTimes(w);
  if (node !== previewNode || !previewTimes) {
    previewNode = node;
    previewTimes = withStationAt(w, node).times;
  }
  return previewTimes;
}

const bandOf = (t: number) => (t <= TARGET ? COVERAGE.fast : t <= SLOW ? COVERAGE.slow : COVERAGE.far);

// ---------------------------------------------------------------- districts and places

function drawPlaces(w: World, ctx: Ctx2D) {
  const z = w.cam.zoom;
  if (z < 0.55) {
    ctx.font = `600 10.5px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const zone of w.city.zones) {
      if (zone.kind === 'parc' && z < 0.25) continue;
      const [x, y] = toScreen(w, zone.cx, zone.cy);
      const text = spaced((zone.name || ZONE_LABEL[zone.kind]).toUpperCase());
      ctx.lineWidth = 3;
      ctx.strokeStyle = MAP.halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = zone.kind === 'industriel' ? '#9f86c9' : zone.kind === 'commercial' ? '#b8924a' : '#5f8f6a';
      ctx.fillText(text, x, y);
    }
  }
  if (z > 0.35) {
    for (const h of w.city.hotspots) {
      const [x, y] = toScreen(w, h.x, h.y);
      if (x < -20 || y < -20 || x > w.view.w + 20 || y > w.view.h + 20) continue;
      ctx.fillStyle = '#0b0e12';
      ctx.strokeStyle = '#3a4350';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x - 9, y - 9, 18, 18);
      ctx.fill();
      ctx.stroke();
      drawIcon(ctx, h.kind as IconName, x, y, 13, '#8b949e', 2);
      if (z > 0.8) {
        ctx.font = `500 9px ${FONT.mono}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#768294';
        ctx.fillText((h.name || HOTSPOT_LABEL[h.kind]).toUpperCase(), x, y + 17);
      }
    }
  }
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

/** Letter-spaced capitals for district names (thin spaces: the canvas has no tracking here). */
const spaced = (s: string) => [...s].join('\u2009');

/** At night, some windows light up: a warm dot on about one building in three. */
function drawWindows(w: World, ctx: Ctx2D, cells: { r0: number; r1: number; c0: number; c1: number }, night: number) {
  const { city } = w;
  const g = city.grid;
  const size = Math.max(1.2, Math.min(3, 4 * w.cam.zoom));
  ctx.fillStyle = MAP.window;
  for (let r = cells.r0; r <= cells.r1; r++) {
    for (let c = cells.c0; c <= cells.c1; c++) {
      for (const i of g.buildings[r * g.cols + c]) {
        const h = ((i * 2654435761) >>> 0) % 100;
        if (h > 34 * night) continue;
        const pts = city.file.buildings[i];
        let x = 0, y = 0;
        const n = pts.length / 2;
        for (let k = 0; k < pts.length; k += 2) { x += pts[k]; y += pts[k + 1]; }
        const [sx, sy] = toScreen(w, x / n, y / n);
        ctx.globalAlpha = 0.35 + (h % 7) / 14;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
    }
  }
  ctx.globalAlpha = 1;
}
