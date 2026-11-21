// Coverage: how fast the service reaches each street from its nearest station.
// Drives the map overlay and the gain shown before building.
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
