// OpenStreetMap → CityFile: the commune's drivable roads become a routing graph
// (split at junctions, simplified, largest connected part only), its buildings,
// water and parks polygons, its stations points. Shared by the game (downloading
// the player's town) and tools/bake-osm.ts.
import type { HotspotKind, ZoneKind } from '../catalog/places.ts';
import type { CityFile, PoiKind } from '../city.ts';
import { ROAD_CLASSES } from './query.ts';
import type { OsmElement, OsmResponse } from './types.ts';

/** A node's position, or a way's / relation's centre. */
const where = (e: OsmElement) => {
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  return lat === undefined || lon === undefined ? null : { lat, lon };
};

/** Called every few thousand items so a native host's turn budget is never exceeded. */
export type Pause = () => Promise<void>;
const none: Pause = async () => {};

interface Geo { lat: number; lon: number }

const classOf = (h: string) =>
  /^(motorway|trunk|primary)/.test(h) ? 0 : /^secondary/.test(h) ? 1 : /^(tertiary|unclassified)/.test(h) ? 2 : 3;

const KIND: Record<string, PoiKind> = { fire_station: 'fire', hospital: 'hospital', police: 'police' };
const DEFAULT_NAME: Record<PoiKind, string> = { fire: 'Centre de secours', hospital: 'Hôpital', police: 'Commissariat' };
const PAD = 150;

export async function convert(
  roads: OsmResponse,
  areas: OsmResponse | null,
  fallbackName: string,
  pause: Pause = none,
): Promise<CityFile> {
  const els = roads.elements;

  // ------------------------------------------------ projection (metres, y south)
  const nodeLL = new Map<number, [number, number]>();
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const e of els) {
    if (e.type !== 'node' || e.lat === undefined || e.lon === undefined) continue;
    const { lat, lon } = e;
    nodeLL.set(e.id, [lon, lat]);
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  if (nodeLL.size === 0) throw new Error('Aucune route trouvée pour cette commune.');
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) * 111320;
  const ky = 110540;
  const px = (lon: number) => Math.round((lon - minLon) * kx + PAD);
  const py = (lat: number) => Math.round((maxLat - lat) * ky + PAD);
  const width = Math.round((maxLon - minLon) * kx + PAD * 2);
  const height = Math.round((maxLat - minLat) * ky + PAD * 2);

  // ------------------------------------------------ roads → graph
  const roadRe = new RegExp(`^(${ROAD_CLASSES})$`);
  const ways = els
    .filter((e) => e.type === 'way' && e.nodes && roadRe.test(e.tags?.highway ?? ''))
    .map((e) => ({ nodes: e.nodes!, tags: e.tags! }));
  const uses = new Map<number, number>();
  for (const w of ways) {
    w.nodes.forEach((n: number, i: number) => {
      const end = i === 0 || i === w.nodes.length - 1;
      uses.set(n, (uses.get(n) ?? 0) + (end ? 2 : 1));
    });
  }
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
  const dist = (p: number[], a: number[], b: number[]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const edges: number[] = [];
  let count = 0;
  for (const w of ways) {
    if (++count % 2000 === 0) await pause();
    const ids: number[] = w.nodes.filter((n: number) => nodeLL.has(n));
    if (ids.length < 2) continue;
    const cls = classOf(w.tags.highway);
    const label = nameOf(w.tags.name ?? w.tags.ref ?? (cls === 0 ? 'Route principale' : 'Rue sans nom'));
    let piece: number[] = [ids[0]];
    const flush = () => {
      // Keep the points where the street bends (Douglas–Peucker, 5 m).
      const pts = piece.map((n) => { const [lon, lat] = nodeLL.get(n)!; return [px(lon), py(lat)]; });
      const keep = new Array(piece.length).fill(false);
      keep[0] = keep[piece.length - 1] = true;
      const stack: [number, number][] = [[0, piece.length - 1]];
      while (stack.length) {
        const [i, j] = stack.pop()!;
        let best = -1, bd = 5;
        for (let k = i + 1; k < j; k++) { const d = dist(pts[k], pts[i], pts[j]); if (d > bd) { bd = d; best = k; } }
        if (best >= 0) { keep[best] = true; stack.push([i, best], [best, j]); }
      }
      const kept = piece.filter((_, i) => keep[i]);
      for (let i = 0; i + 1 < kept.length; i++) edges.push(vertex(kept[i]), vertex(kept[i + 1]), cls, label);
    };
    for (let i = 1; i < ids.length; i++) {
      piece.push(ids[i]);
      if ((uses.get(ids[i]) ?? 0) > 1 && i < ids.length - 1) { flush(); piece = [ids[i]]; }
    }
    flush();
  }
  await pause();

  // Largest connected component only.
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
  for (let i = 0; i < edges.length; i += 4) {
    if (comp[edges[i]] === best && edges[i] !== edges[i + 1]) keptEdges.push(edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
  }
  await pause();

  // ------------------------------------------------ stations
  const pois: CityFile['pois'] = [];
  for (const e of els) {
    const tags = e.tags;
    const kind = tags ? KIND[tags.amenity] : undefined;
    const at = where(e);
    if (!tags || !kind || !at) continue;
    const x = px(at.lon), y = py(at.lat);
    if (pois.some((p) => p.kind === kind && Math.hypot(p.x - x, p.y - y) < 150)) continue;
    pois.push({ kind, name: tags.name ?? DEFAULT_NAME[kind], x, y });
  }

  // ------------------------------------------------ areas
  const ring = (geom: Geo[], tol: number) => {
    const pts: number[] = [];
    let lx = NaN, ly = NaN;
    for (const g of geom) {
      const x = px(g.lon), y = py(g.lat);
      if (Math.hypot(x - lx, y - ly) < tol) continue;
      pts.push(x, y); lx = x; ly = y;
    }
    return pts;
  };
  const strip = (geom: Geo[], half: number) => {
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
  const water: number[][] = [], parks: number[][] = [], buildings: number[][] = [];
  const zones: NonNullable<CityFile['zones']> = [];
  const area = (p: number[]) => {
    let s = 0;
    for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; s += p[i] * p[j + 1] - p[j] * p[i + 1]; }
    return Math.abs(s / 2);
  };
  const ZONE: Record<string, ZoneKind> = { industrial: 'industriel', commercial: 'commercial', retail: 'commercial' };
  count = 0;
  for (const e of areas?.elements ?? []) {
    if (++count % 3000 === 0) await pause();
    const t = e.tags ?? {};
    if (e.type === 'way' && e.geometry) {
      const g = e.geometry as Geo[];
      const closed = g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
      if (t.waterway === 'river' || t.waterway === 'canal') water.push(strip(g, t.waterway === 'river' ? 22 : 10));
      else if ((t.natural === 'water' || t.waterway === 'riverbank') && closed) water.push(ring(g, 4));
      else if (ZONE[t.landuse] && closed) {
        const pts = ring(g, 8);
        if (area(pts) > 15000) zones.push({ kind: ZONE[t.landuse], name: t.name ?? '', pts });
      } else if ((t.leisure || t.landuse) && closed) {
        const pts = ring(g, 4);
        parks.push(pts);
        if (t.name && area(pts) > 20000) zones.push({ kind: 'parc', name: t.name, pts });
      }
      else if ((t.building || !e.tags) && closed) {
        const b = ring(g, 1.5);
        if (b.length >= 6) buildings.push(b);
      }
    } else if (e.type === 'relation' && t.natural === 'water' && e.members) {
      for (const m of e.members) if (m.role === 'outer' && m.geometry && m.geometry.length > 3) water.push(ring(m.geometry, 4));
    }
  }

  // Every service needs at least one real site to buy.
  const centre = { x: Math.round(width / 2), y: Math.round(height / 2) };
  (['fire', 'hospital', 'police'] as PoiKind[]).forEach((kind, i) => {
    if (!pois.some((p) => p.kind === kind)) {
      pois.push({ kind, name: `${DEFAULT_NAME[kind]} (terrain libre)`, x: centre.x + (i - 1) * 300, y: centre.y + 200 });
    }
  });
  // Sensitive places: bars, schools, nursing homes, stadiums, stations.
  const HOT = (t: Record<string, string>): HotspotKind | null =>
    /^(bar|pub|nightclub)$/.test(t.amenity) ? 'bar' : t.amenity === 'school' ? 'ecole'
      : t.amenity === 'nursing_home' || t.social_facility === 'nursing_home' ? 'ehpad'
      : t.leisure === 'stadium' ? 'stade' : t.railway === 'station' ? 'gare' : null;
  const hotspots: NonNullable<CityFile['hotspots']> = [];
  const perKind: Record<string, number> = {};
  for (const e of els) {
    const kind = e.tags ? HOT(e.tags) : null;
    const at = where(e);
    if (!kind || !at || (perKind[kind] = (perKind[kind] ?? 0) + 1) > 60) continue;
    hotspots.push({ kind, name: e.tags?.name ?? '', x: px(at.lon), y: py(at.lat) });
  }
  const rel = els.find((e) => e.type === 'relation' && e.tags?.boundary === 'administrative');
  return {
    name: rel?.tags?.name ?? fallbackName,
    source: 'osm',
    attribution: '© contributeurs OpenStreetMap (ODbL)',
    width, height, nodes, edges: keptEdges, names, water, parks, buildings, zones, hotspots,
    pois: (['fire', 'hospital', 'police'] as PoiKind[]).flatMap((k) => pois.filter((p) => p.kind === k).slice(0, 6)),
  };
}
