// Picking where a call happens: streets near bars see more fights, those near
// nursing homes more falls, industrial zones their fires, main roads their crashes.
import { AFFINITY, HOTSPOT_LABEL, HOTSPOT_RADIUS, type Place } from './catalog/places.ts';
import type { CallKind } from './catalog/calls.ts';
import { inside, type City } from './city.ts';
import type { Rng } from './rng.ts';

/** Places around a street's middle. */
export function placesAt(city: City, edge: number): Set<Place> {
  const e = city.edges[edge];
  const x = (city.nx[e.a] + city.nx[e.b]) / 2, y = (city.ny[e.a] + city.ny[e.b]) / 2;
  const out = new Set<Place>();
  if (e.cls <= 1) out.add('axe');
  for (const h of city.hotspots) if (Math.hypot(h.x - x, h.y - y) < HOTSPOT_RADIUS) out.add(h.kind);
  for (const z of city.zones) if (inside(z.pts, x, y)) out.add(z.kind);
  return out;
}

/** Draws a street for `kind` among a few random candidates, weighted by affinity. */
export function pickStreet(city: City, kind: CallKind, rng: Rng, avoid: (edge: number) => boolean): number {
  const affinity = AFFINITY[kind.id] ?? {};
  const candidates: { edge: number; weight: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const edge = city.callEdges[Math.floor(rng() * city.callEdges.length)];
    if (avoid(edge)) continue;
    let weight = 1;
    for (const p of placesAt(city, edge)) weight += affinity[p] ?? 0;
    candidates.push({ edge, weight });
  }
  if (candidates.length === 0) return city.callEdges[Math.floor(rng() * city.callEdges.length)];
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of candidates) { r -= c.weight; if (r <= 0) return c.edge; }
  return candidates[candidates.length - 1].edge;
}

/** "devant Le Central" when a named place the call is drawn to stands close by. */
export function landmark(city: City, kind: CallKind, x: number, y: number): string {
  const affinity = AFFINITY[kind.id] ?? {};
  let best = '', bd = HOTSPOT_RADIUS;
  for (const h of city.hotspots) {
    if (!affinity[h.kind]) continue;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d < bd) { bd = d; best = h.name || HOTSPOT_LABEL[h.kind]; }
  }
  return best;
}
