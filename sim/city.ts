// The city format shared by the demo generator (tools/gen-demo-city.ts) and the
// OpenStreetMap baker (tools/bake-osm.ts). Coordinates are metres, origin at the
// top-left corner of the bounding box, y pointing south (screen order).

export type PoiKind = 'fire' | 'hospital' | 'police';

export interface CityFile {
  name: string;
  source: 'demo' | 'osm';
  attribution: string;
  width: number;
  height: number;
  /** Flat [x0, y0, x1, y1, …], rounded to the metre. */
  nodes: number[];
  /** Flat [a, b, roadClass, nameIndex, …]; roadClass 0 = boulevard … 3 = local street. */
  edges: number[];
  names: string[];
  water: number[][];
  parks: number[][];
  buildings: number[][];
  pois: { kind: PoiKind; name: string; x: number; y: number }[];
}

export interface Edge {
  a: number;
  b: number;
  cls: number;
  name: number;
  len: number;
}

export interface Poi {
  kind: PoiKind;
  name: string;
  node: number;
  x: number;
  y: number;
}

/** A city ready for routing and drawing: adjacency, edge lengths, a spatial grid. */
export interface City {
  file: CityFile;
  name: string;
  width: number;
  height: number;
  nx: Float64Array;
  ny: Float64Array;
  edges: Edge[];
  /** For each node, the indexes of its edges. */
  adj: number[][];
  pois: Poi[];
  /** Edges a call can happen on (local streets first). */
  callEdges: number[];
  /** Buckets of polygon/edge indexes by grid cell, for culling while drawing. */
  grid: { size: number; cols: number; rows: number; edges: number[][]; buildings: number[][] };
}

const CELL = 250;

export function loadCity(file: CityFile): City {
  const n = file.nodes.length / 2;
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    nx[i] = file.nodes[i * 2];
    ny[i] = file.nodes[i * 2 + 1];
  }
  const edges: Edge[] = [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < file.edges.length; i += 4) {
    const a = file.edges[i], b = file.edges[i + 1];
    const len = Math.hypot(nx[a] - nx[b], ny[a] - ny[b]);
    const id = edges.length;
    edges.push({ a, b, cls: file.edges[i + 2], name: file.edges[i + 3], len: Math.max(1, len) });
    adj[a].push(id);
    adj[b].push(id);
  }
  const cols = Math.ceil(file.width / CELL) + 1;
  const rows = Math.ceil(file.height / CELL) + 1;
  const cellOf = (x: number, y: number) =>
    Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x / CELL)));
  const gEdges: number[][] = Array.from({ length: cols * rows }, () => []);
  edges.forEach((e, i) => {
    const c1 = cellOf(nx[e.a], ny[e.a]);
    const c2 = cellOf(nx[e.b], ny[e.b]);
    gEdges[c1].push(i);
    if (c2 !== c1) gEdges[c2].push(i);
  });
  const gBuild: number[][] = Array.from({ length: cols * rows }, () => []);
  file.buildings.forEach((p, i) => gBuild[cellOf(p[0], p[1])].push(i));

  const nearestNode = (x: number, y: number) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (adj[i].length === 0) continue;
      const d = (nx[i] - x) ** 2 + (ny[i] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const pois: Poi[] = file.pois.map((p) => {
    const node = nearestNode(p.x, p.y);
    return { kind: p.kind, name: p.name, node, x: nx[node], y: ny[node] };
  });
  const callEdges = edges.map((_, i) => i).filter((i) => edges[i].cls >= 1 && edges[i].len > 40);
  return {
    file, name: file.name, width: file.width, height: file.height, nx, ny, edges, adj, pois,
    callEdges: callEdges.length > 0 ? callEdges : edges.map((_, i) => i),
    grid: { size: CELL, cols, rows, edges: gEdges, buildings: gBuild },
  };
}
