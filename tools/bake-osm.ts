// Bakes a real town from OpenStreetMap into data/city.json (the format of sim/city.ts):
// the whole commune's drivable roads as a routing graph, buildings, water, parks,
// and its real fire stations, hospitals and police stations.
//
//   bun tools/bake-osm.ts "Annecy"
//   bun tools/bake-osm.ts "Saint-Denis" --insee 93066      (when several communes share a name)
//   bun tools/bake-osm.ts "Lyon" --admin-level 8 --max-buildings 40000
//
// Data © OpenStreetMap contributors, ODbL. Needs network access to overpass-api.de.
import type { CityFile, PoiKind } from '../sim/city.ts';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!name) {
  console.error('usage: bun tools/bake-osm.ts "<Commune>" [--insee 74010] [--admin-level 8] [--max-buildings 40000]');
  process.exit(1);
}
const adminLevel = opt('admin-level') ?? '8';
const insee = opt('insee');
const maxBuildings = Number(opt('max-buildings') ?? 40000);
const endpoint = opt('endpoint') ?? 'https://overpass-api.de/api/interpreter';

const areaFilter = insee
  ? `area["boundary"="administrative"]["ref:INSEE"="${insee}"]->.a;`
  : `area["boundary"="administrative"]["admin_level"="${adminLevel}"]["name"="${name.replace(/"/g, '\\"')}"]->.a;`;

const ROADS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const query = `[out:json][timeout:240];
${areaFilter}
way["highway"~"^(${ROADS})$"](area.a)->.roads;
.roads out body;
.roads >;
out skel qt;
(
  way["natural"="water"](area.a);
  way["waterway"="riverbank"](area.a);
  relation["natural"="water"](area.a);
  way["waterway"~"^(river|canal)$"](area.a);
  way["leisure"~"^(park|garden)$"](area.a);
  way["landuse"~"^(grass|forest|recreation_ground|cemetery)$"](area.a);
  way["building"](area.a);
);
out geom qt;
nwr["amenity"~"^(fire_station|hospital|police)$"](area.a);
out center tags;
rel["boundary"="administrative"]["admin_level"="${adminLevel}"]${insee ? `["ref:INSEE"="${insee}"]` : `["name"="${name.replace(/"/g, '\\"')}"]`};
out bb tags;`;

console.log(`Overpass: ${name}…`);
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'emergencyxsim-bake/1.0' },
  body: `data=${encodeURIComponent(query)}`,
});
if (!res.ok) {
  console.error(`Overpass answered ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const osm = (await res.json()) as { elements: any[] };
const els = osm.elements;
console.log(`${els.length} OSM elements`);

// ---------------------------------------------------------------- projection
const lats: number[] = [], lons: number[] = [];
for (const e of els) {
  if (e.type === 'node' && e.lat !== undefined) { lats.push(e.lat); lons.push(e.lon); }
}
if (lats.length === 0) {
  console.error('No roads found: check the name (exact OSM spelling), or pass --insee.');
  process.exit(1);
}
const minLat = Math.min(...lats), maxLat = Math.max(...lats);
const minLon = Math.min(...lons), maxLon = Math.max(...lons);
const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) * 111320;
const ky = 110540;
const PAD = 150;
const px = (lon: number) => Math.round((lon - minLon) * kx + PAD);
const py = (lat: number) => Math.round((maxLat - lat) * ky + PAD);
const width = Math.round((maxLon - minLon) * kx + PAD * 2);
const height = Math.round((maxLat - minLat) * ky + PAD * 2);

// ---------------------------------------------------------------- roads → graph
const nodeLL = new Map<number, [number, number]>();
for (const e of els) if (e.type === 'node' && e.lat !== undefined) nodeLL.set(e.id, [e.lon, e.lat]);
const roadWays = els.filter((e) => e.type === 'way' && e.tags?.highway && e.nodes && new RegExp(`^(${ROADS})$`).test(e.tags.highway));
const uses = new Map<number, number>();
for (const w of roadWays) {
  w.nodes.forEach((n: number, i: number) => {
    const end = i === 0 || i === w.nodes.length - 1;
    uses.set(n, (uses.get(n) ?? 0) + (end ? 2 : 1));
  });
}
const classOf = (h: string) =>
  /^(motorway|trunk|primary)/.test(h) ? 0 : /^secondary/.test(h) ? 1 : /^(tertiary|unclassified)/.test(h) ? 2 : 3;

const names: string[] = [];
const nameIdx = new Map<string, number>();
const nameOf = (s: string) => {
  let i = nameIdx.get(s);
  if (i === undefined) { i = names.length; names.push(s); nameIdx.set(s, i); }
  return i;
};
const idOf = new Map<number, number>();
const nodes: number[] = [];
const vertex = (osmId: number) => {
  let i = idOf.get(osmId);
  if (i === undefined) {
    const [lon, lat] = nodeLL.get(osmId)!;
    i = nodes.length / 2;
    nodes.push(px(lon), py(lat));
    idOf.set(osmId, i);
  }
  return i;
};
/** Perpendicular distance from p to segment ab, in metres. */
const dist = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const edges: number[] = [];
for (const w of roadWays) {
  const ids: number[] = w.nodes.filter((n: number) => nodeLL.has(n));
  if (ids.length < 2) continue;
  const cls = classOf(w.tags.highway);
  const label = nameOf(w.tags.name ?? w.tags.ref ?? (cls === 0 ? 'Route principale' : 'Rue sans nom'));
  // Split at junctions; inside each piece keep only the points that bend (5 m tolerance).
  let piece: number[] = [ids[0]];
  const flush = () => {
    const pts = piece.map((n) => { const [lon, lat] = nodeLL.get(n)!; return [px(lon), py(lat)]; });
    const keep = new Array(piece.length).fill(false);
    keep[0] = keep[piece.length - 1] = true;
    const dp = (i: number, j: number) => {
      let best = -1, bd = 5;
      for (let k = i + 1; k < j; k++) { const d = dist(pts[k], pts[i], pts[j]); if (d > bd) { bd = d; best = k; } }
      if (best >= 0) { keep[best] = true; dp(i, best); dp(best, j); }
    };
    dp(0, piece.length - 1);
    const kept = piece.filter((_, i) => keep[i]);
    for (let i = 0; i + 1 < kept.length; i++) edges.push(vertex(kept[i]), vertex(kept[i + 1]), cls, label);
  };
  for (let i = 1; i < ids.length; i++) {
    piece.push(ids[i]);
    if ((uses.get(ids[i]) ?? 0) > 1 && i < ids.length - 1) { flush(); piece = [ids[i]]; }
  }
  flush();
}

// Largest connected component only (islands of private roads are dropped).
const n = nodes.length / 2;
const adj: number[][] = Array.from({ length: n }, () => []);
for (let i = 0; i < edges.length; i += 4) { adj[edges[i]].push(edges[i + 1]); adj[edges[i + 1]].push(edges[i]); }
const comp = new Int32Array(n).fill(-1);
let best = -1, bestSize = 0;
for (let s = 0; s < n; s++) {
  if (comp[s] >= 0 || adj[s].length === 0) continue;
  const stack = [s]; comp[s] = s; let size = 0;
  while (stack.length) { const u = stack.pop()!; size++; for (const v of adj[u]) if (comp[v] < 0) { comp[v] = s; stack.push(v); } }
  if (size > bestSize) { bestSize = size; best = s; }
}
const keptEdges: number[] = [];
for (let i = 0; i < edges.length; i += 4) if (comp[edges[i]] === best && edges[i] !== edges[i + 1]) keptEdges.push(...edges.slice(i, i + 4));

// ---------------------------------------------------------------- areas
const ring = (geom: { lat: number; lon: number }[], tol = 2) => {
  const pts: number[] = [];
  let lx = NaN, ly = NaN;
  for (const g of geom) {
    const x = px(g.lon), y = py(g.lat);
    if (Math.hypot(x - lx, y - ly) < tol) continue;
    pts.push(x, y); lx = x; ly = y;
  }
  return pts;
};
const area = (p: number[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    s += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return Math.abs(s / 2);
};
/** A river line drawn as a strip polygon. */
const strip = (geom: { lat: number; lon: number }[], half: number) => {
  const pts = geom.map((g) => [px(g.lon), py(g.lat)]);
  const left: number[] = [], right: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    left.push(Math.round(pts[i][0] - (dy / l) * half), Math.round(pts[i][1] + (dx / l) * half));
    right.unshift(Math.round(pts[i][0] + (dy / l) * half), Math.round(pts[i][1] - (dx / l) * half));
  }
  for (let i = 0; i < right.length; i += 2) left.push(right[i], right[i + 1]);
  return left;
};

const water: number[][] = [], parks: number[][] = [];
let buildings: number[][] = [];
for (const e of els) {
  const t = e.tags ?? {};
  if (e.type === 'way' && e.geometry) {
    const closed = e.nodes && e.nodes[0] === e.nodes[e.nodes.length - 1];
    if (t.waterway === 'river' || t.waterway === 'canal') water.push(strip(e.geometry, t.waterway === 'river' ? 22 : 10));
    else if ((t.natural === 'water' || t.waterway === 'riverbank') && closed) water.push(ring(e.geometry, 4));
    else if ((t.leisure || t.landuse) && closed) parks.push(ring(e.geometry, 4));
    else if (t.building && closed) buildings.push(ring(e.geometry, 1.5));
  } else if (e.type === 'relation' && t.natural === 'water' && e.members) {
    for (const m of e.members) if (m.role === 'outer' && m.geometry && m.geometry.length > 3) water.push(ring(m.geometry, 4));
  }
}
buildings = buildings.filter((b) => b.length >= 6);
if (buildings.length > maxBuildings) {
  buildings.sort((a, b) => area(b) - area(a));
  buildings = buildings.slice(0, maxBuildings);
  console.log(`buildings: kept the ${maxBuildings} largest`);
}

// ---------------------------------------------------------------- stations
const KIND: Record<string, PoiKind> = { fire_station: 'fire', hospital: 'hospital', police: 'police' };
const DEFAULT_NAME: Record<PoiKind, string> = { fire: 'Centre de secours', hospital: 'Hôpital', police: 'Commissariat' };
const pois: CityFile['pois'] = [];
for (const e of els) {
  const kind = KIND[e.tags?.amenity];
  if (!kind) continue;
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (lat === undefined) continue;
  const x = px(lon), y = py(lat);
  if (pois.some((p) => p.kind === kind && Math.hypot(p.x - x, p.y - y) < 150)) continue; // one building, several tags
  pois.push({ kind, name: e.tags.name ?? DEFAULT_NAME[kind], x, y });
}
// Every service needs a base: a commune without one gets a fictive one near the centre.
const centre = { x: Math.round(width / 2), y: Math.round(height / 2) };
(['fire', 'hospital', 'police'] as PoiKind[]).forEach((kind, i) => {
  if (!pois.some((p) => p.kind === kind)) {
    pois.push({ kind, name: `${DEFAULT_NAME[kind]} (fictif)`, x: centre.x + (i - 1) * 300, y: centre.y + 200 });
    console.log(`no ${kind} in OSM for ${name}: added a fictive one`);
  }
});
// Keep the game playable: at most 4 stations of each kind (the largest names first).
const capped = (['fire', 'hospital', 'police'] as PoiKind[]).flatMap((k) => pois.filter((p) => p.kind === k).slice(0, 4));

const rel = els.find((e) => e.type === 'relation' && e.tags?.boundary === 'administrative');
const file: CityFile = {
  name: rel?.tags?.name ?? name,
  source: 'osm',
  attribution: '© OpenStreetMap contributors (ODbL)',
  width, height,
  nodes, edges: keptEdges, names, water, parks, buildings, pois: capped,
};
const out = new URL('../data/city.json', import.meta.url);
await Bun.write(out, JSON.stringify(file));
const size = (await Bun.file(out).size) / 1e6;
console.log(`data/city.json: ${file.name}, ${(width / 1000).toFixed(1)} × ${(height / 1000).toFixed(1)} km, ${n} nodes, ${keptEdges.length / 4} road segments, ${buildings.length} buildings, ${water.length} water, ${parks.length} parks, ${capped.length} stations — ${size.toFixed(1)} MB`);
