// Coverage: how fast the service reaches each street from its nearest station.
// Drives the map overlay and the gain shown before building.
import type { Service } from './catalog/units.ts';
import { inside } from './city.ts';
import { search } from './routing.ts';
import type { World } from './types.ts';

/** The standard the game grades against: a street is covered under 3 minutes. */
export const TARGET = 3 * 60;
export const SLOW = 5 * 60;

let cacheKey = '';
let cacheTimes: Float64Array | null = null;

const keyOf = (w: World) => `${w.city.name}|${w.buildings.map((b) => b.node).join(',')}`;

/** Seconds from the nearest station to every node (Infinity with no station). */
export function coverageTimes(w: World): Float64Array {
  const key = keyOf(w);
  if (key !== cacheKey || !cacheTimes) {
    cacheKey = key;
    cacheTimes = w.buildings.length
      ? search(w.city, w.buildings.map((b) => b.node)).time
      : new Float64Array(w.city.nx.length).fill(Infinity);
  }
  return cacheTimes;
}

/** Share of the road length reached within TARGET (0–1). */
export function coverageShare(w: World, times = coverageTimes(w)): number {
  let covered = 0, total = 0;
  for (const e of w.city.edges) {
    total += e.len;
    if (Math.min(times[e.a], times[e.b]) <= TARGET) covered += e.len;
  }
  return total > 0 ? covered / total : 0;
}

/** Times with a new station at `node`, and the coverage it would add. */
export function withStationAt(w: World, node: number) {
  const base = coverageTimes(w);
  const extra = search(w.city, node).time;
  const times = new Float64Array(base.length);
  for (let i = 0; i < base.length; i++) times[i] = Math.min(base[i], extra[i]);
  const before = coverageShare(w, base), after = coverageShare(w, times);
  return { times, before, after, gain: after - before };
}

// ---------------------------------------------------------------- live coverage
// What the free vehicles cover right now, service by service: sending one away
// can leave a part of town more than 3 minutes from any help.

const liveCache = new Map<string, Float64Array>();

/** Free crews of a service, as the node each would leave from. */
function freeNodes(w: World, service: Service, excluded: Set<string>): number[] {
  return w.units
    .filter((u) => u.service === service && !excluded.has(u.id) && (u.status === 'dispo' || u.status === 'poste' || u.status === 'retour'))
    .map((u) => (u.path.length > 1 && u.along > 0 ? u.path[1] : u.path[0]))
    .sort((a, b) => a - b);
}

function liveTimes(w: World, service: Service, excluded: Set<string>): Float64Array {
  const nodes = freeNodes(w, service, excluded);
  const key = `${w.city.name}|${service}|${nodes.join(',')}`;
  let times = liveCache.get(key);
  if (!times) {
    times = nodes.length ? search(w.city, nodes).time : new Float64Array(w.city.nx.length).fill(Infinity);
    if (liveCache.size > 64) liveCache.clear();
    liveCache.set(key, times);
  }
  return times;
}

/** Coverage lost if these units leave, and the part of town that loses it. */
export function departureCost(w: World, unitIds: string[]): { loss: number; where: string } {
  const leaving = w.units.filter((u) => unitIds.includes(u.id));
  let loss = 0, sx = 0, sy = 0, n = 0;
  for (const service of new Set(leaving.map((u) => u.service))) {
    const before = liveTimes(w, service, new Set());
    const after = liveTimes(w, service, new Set(unitIds));
    let total = 0, lost = 0;
    for (const e of w.city.edges) {
      total += e.len;
      const was = Math.min(before[e.a], before[e.b]) <= TARGET;
      const is = Math.min(after[e.a], after[e.b]) <= TARGET;
      if (was && !is) {
        lost += e.len;
        sx += (w.city.nx[e.a] + w.city.nx[e.b]) / 2;
        sy += (w.city.ny[e.a] + w.city.ny[e.b]) / 2;
        n++;
      }
    }
    loss = Math.max(loss, total > 0 ? lost / total : 0);
  }
  return { loss, where: n ? placeName(w, sx / n, sy / n) : '' };
}

/** A district's name near (x, y), else a compass sector of the town. */
function placeName(w: World, x: number, y: number): string {
  const zone = w.city.zones.find((z) => inside(z.pts, x, y));
  if (zone?.name) return zone.name;
  const dx = x - w.city.width / 2, dy = y - w.city.height / 2;
  const ns = dy < -w.city.height / 6 ? 'nord' : dy > w.city.height / 6 ? 'sud' : '';
  const ew = dx > w.city.width / 6 ? 'est' : dx < -w.city.width / 6 ? 'ouest' : '';
  return ns || ew ? `secteur ${[ns, ew].filter(Boolean).join('-')}` : 'centre-ville';
}
