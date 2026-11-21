// Route searches with traffic: rush hours slow the big roads; a fixed per-street
// factor keeps routes varied. Station searches are cached; call searches live
// as long as their call.
import { hourOf } from './clock.ts';
import { search, type Tree } from './routing.ts';
import type { Call, World } from './types.ts';

export function trafficAt(w: World, edge: number): number {
  const hour = hourOf(w.t);
  const rush = Math.max(0, 1 - Math.abs(hour - 8.5) / 1.2) + Math.max(0, 1 - Math.abs(hour - 18) / 1.5);
  if (w.blocked.has(edge)) return 40; // flooded: only as a last resort
  const cls = w.city.edges[edge].cls;
  const noise = ((edge * 2654435761) >>> 0) / 4294967296;
  // Weather slows every street; a match, the market or roadworks slow theirs.
  return (1 + rush * (cls <= 1 ? 0.6 : 0.25) + noise * 0.2) * w.trafficMul * (w.slowEdges.get(edge) ?? 1);
}

export function treeFromStation(w: World, node: number): Tree {
  const hit = w.stationTrees.get(node);
  if (hit) return hit;
  const tree = search(w.city, node, (e) => trafficAt(w, e));
  w.stationTrees.set(node, tree);
  return tree;
}

export function treeFromCall(w: World, call: Call): Tree {
  let tree = w.callTrees.get(call.id);
  if (!tree) {
    tree = search(w.city, call.node, (e) => trafficAt(w, e));
    w.callTrees.set(call.id, tree);
  }
  return tree;
}

export const freshTree = (w: World, node: number) => search(w.city, node, (e) => trafficAt(w, e));
