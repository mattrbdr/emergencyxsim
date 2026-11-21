// Shortest paths on the road graph (Dijkstra with a binary heap). The graph is
// undirected, so one search from a call reaches every unit, and a search from a
// station is cached for the whole shift.
import type { City } from './city.ts';

/** Seconds to drive one metre of each road class with lights and sirens. */
const SPEED = [17, 14.5, 12.5, 10]; // m/s: boulevard, avenue, street, lane

export const edgeSpeed = (cls: number) => SPEED[Math.min(3, Math.max(0, cls))];

export interface Tree {
  source: number;
  /** Seconds from the source to each node. */
  time: Float64Array;
  /** Previous node on the way back to the source (-1 for the source). */
  prev: Int32Array;
}

/** Shortest times from `source` (or from the nearest of several sources) to every node. */
export function search(city: City, source: number | number[], traffic?: (edge: number) => number): Tree {
  const sources = Array.isArray(source) ? source : [source];
  const n = city.nx.length;
  const time = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap: number[] = []; // pairs [time, node] packed as two entries
  const push = (t: number, v: number) => {
    heap.push(t, v);
    let i = heap.length / 2 - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p * 2] <= heap[i * 2]) break;
      [heap[p * 2], heap[i * 2]] = [heap[i * 2], heap[p * 2]];
      [heap[p * 2 + 1], heap[i * 2 + 1]] = [heap[i * 2 + 1], heap[p * 2 + 1]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const t = heap[0], v = heap[1];
    const lt = heap.pop()!, lt0 = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = lt0; heap[1] = lt;
      let i = 0;
      const m = heap.length / 2;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < m && heap[l * 2] < heap[s * 2]) s = l;
        if (r < m && heap[r * 2] < heap[s * 2]) s = r;
        if (s === i) break;
        [heap[s * 2], heap[i * 2]] = [heap[i * 2], heap[s * 2]];
        [heap[s * 2 + 1], heap[i * 2 + 1]] = [heap[i * 2 + 1], heap[s * 2 + 1]];
        i = s;
      }
    }
    return [t, v];
  };
  for (const s of sources) {
    time[s] = 0;
    push(0, s);
  }
  while (heap.length > 0) {
    const [t, u] = pop();
    if (t > time[u]) continue;
    for (const ei of city.adj[u]) {
      const e = city.edges[ei];
      const v = e.a === u ? e.b : e.a;
      const nt = t + (e.len / edgeSpeed(e.cls)) * (traffic ? traffic(ei) : 1);
      if (nt < time[v]) {
        time[v] = nt;
        prev[v] = u;
        push(nt, v);
      }
    }
  }
  return { source: sources[0] ?? 0, time, prev };
}

/** The nodes from `from` to the tree's source, following `prev`. */
export function pathTo(tree: Tree, from: number): number[] {
  const path = [from];
  let u = from;
  while (u !== tree.source && tree.prev[u] >= 0) {
    u = tree.prev[u];
    path.push(u);
  }
  return u === tree.source ? path : [from];
}

/** The edge joining two adjacent nodes. */
export function edgeBetween(city: City, a: number, b: number): number {
  for (const ei of city.adj[a]) {
    const e = city.edges[ei];
    if ((e.a === a && e.b === b) || (e.b === a && e.a === b)) return ei;
  }
  return -1;
}
