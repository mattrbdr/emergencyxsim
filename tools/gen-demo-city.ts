// Generates data/city.json: a believable demo town (boulevards, a river with
// bridges, parks, blocks of buildings, fire stations, hospitals, police) in the
// same format tools/bake-osm.ts writes from OpenStreetMap.
//   bun tools/gen-demo-city.ts
import type { CityFile } from '../sim/city.ts';
import { mulberry } from '../sim/rng.ts';

const rnd = mulberry(20261121);
const COLS = 30, ROWS = 21, STEP = 175;
const W = (COLS - 1) * STEP + 200, H = (ROWS - 1) * STEP + 200;
const riverY = (x: number) => 1180 + Math.sin(x / 700) * 160 + Math.sin(x / 260) * 40;
const RIVER_HALF = 70;

const people = [
  'Victor Hugo', 'Émile Zola', 'Marie Curie', 'Jean Jaurès', 'Louis Pasteur', 'George Sand', 'Jules Ferry',
  'Simone Veil', 'Jean Moulin', 'Colette', 'Gambetta', 'Voltaire', 'Molière', 'Rabelais', 'Berlioz',
  'Debussy', 'Gustave Eiffel', 'Lamartine', 'Montesquieu', 'Diderot', 'Condorcet', 'Lavoisier', 'Daudet',
  'Racine', 'Corneille', 'Ronsard', 'Camus', 'Prévert', 'Apollinaire', 'Baudelaire', 'Rimbaud', 'Verlaine',
  'Saint-Exupéry', 'Clemenceau', 'Joliot-Curie', 'Olympe de Gouges', 'Gaston Monnerville', 'Lumière', 'Niépce', 'Ampère',
];

const nodes: number[] = [];
const id = (c: number, r: number) => r * COLS + c;
const alive: boolean[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const boulevard = c % 6 === 0 || r % 5 === 0;
    const j = boulevard ? 8 : 28;
    let x = 100 + c * STEP + (rnd() - 0.5) * j * 2;
    let y = 100 + r * STEP + (rnd() - 0.5) * j * 2;
    // Old town: a gentle swirl around the centre.
    const dx = x - W / 2, dy = y - H * 0.3, d = Math.hypot(dx, dy);
    if (d < 700) {
      const a = (700 - d) / 700 * 0.35;
      x = W / 2 + dx * Math.cos(a) - dy * Math.sin(a);
      y = H * 0.3 + dx * Math.sin(a) + dy * Math.cos(a);
    }
    nodes.push(Math.round(x), Math.round(y));
    alive.push(Math.abs(y - riverY(x)) > RIVER_HALF + 10);
  }
}
const bridges = new Set([3, 9, 15, 20]);

const rowName = (r: number) => (r % 5 === 0 ? 'Boulevard ' : r % 2 ? 'Rue ' : 'Rue ') + people[r % people.length];
const colName = (c: number) => (c % 6 === 0 ? 'Avenue ' : 'Rue ') + people[(c + 17) % people.length];
const names: string[] = [];
const nameIndex = (s: string) => {
  let i = names.indexOf(s);
  if (i < 0) { i = names.length; names.push(s); }
  return i;
};

const edges: number[] = [];
const addEdge = (a: number, b: number, cls: number, name: string) => edges.push(a, b, cls, nameIndex(name));
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const a = id(c, r);
    if (c + 1 < COLS) {
      const b = id(c + 1, r);
      const cls = r % 5 === 0 ? 0 : r % 2 === 0 ? 2 : 3;
      if (alive[a] && alive[b] && (cls < 3 || rnd() > 0.1)) addEdge(a, b, cls, rowName(r));
    }
    if (r + 1 < ROWS) {
      const b = id(c, r + 1);
      const cls = c % 6 === 0 ? 0 : c % 3 === 0 ? 2 : 3;
      const crossesRiver = alive[a] !== alive[b] || (!alive[a] && !alive[b]);
      if (alive[a] && alive[b] && (cls < 3 || rnd() > 0.1)) addEdge(a, b, cls, colName(c));
      else if (bridges.has(c) && crossesRiver) {
        // A bridge: keep the column across the water.
        let r2 = r + 1;
        while (r2 < ROWS && !alive[id(c, r2)]) r2++;
        if (alive[a] && r2 < ROWS) addEdge(a, id(c, r2), Math.min(cls, 1), `Pont ${people[(c + 5) % people.length]}`);
      }
    }
  }
}
// Two diagonal avenues through the old town.
for (let k = 0; k < 7; k++) {
  const a = id(5 + k, 1 + k), b = id(6 + k, 2 + k);
  if (alive[a] && alive[b]) addEdge(a, b, 1, 'Avenue de la République');
  const c2 = id(18 - k, 1 + k), d2 = id(17 - k, 2 + k);
  if (alive[c2] && alive[d2]) addEdge(c2, d2, 1, 'Avenue de la Libération');
}

// Keep the largest connected component only.
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
for (let i = 0; i < edges.length; i += 4) if (comp[edges[i]] === best) keptEdges.push(...edges.slice(i, i + 4));

// Water: the river band as a polygon.
const top: number[] = [];
for (let x = -50; x <= W + 50; x += 40) top.push(x, Math.round(riverY(x) - RIVER_HALF));
const bottomPairs: number[] = [];
for (let x = W + 50; x >= -50; x -= 40) bottomPairs.push(x, Math.round(riverY(x) + RIVER_HALF));
const water = [top.concat(bottomPairs)];

// Blocks: parks and buildings.
const P = (c: number, r: number) => [nodes[id(c, r) * 2], nodes[id(c, r) * 2 + 1]];
const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const inBlock = (q: number[][], u: number, v: number) => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
const parks: number[][] = [];
const buildings: number[][] = [];
for (let r = 0; r + 1 < ROWS; r++) {
  for (let c = 0; c + 1 < COLS; c++) {
    if (!alive[id(c, r)] || !alive[id(c + 1, r)] || !alive[id(c, r + 1)] || !alive[id(c + 1, r + 1)]) continue;
    const q = [P(c, r), P(c + 1, r), P(c + 1, r + 1), P(c, r + 1)];
    if (rnd() < 0.07 || (c === 11 && r === 7) || (c === 12 && r === 7)) {
      const m = 0.08;
      parks.push([inBlock(q, m, m), inBlock(q, 1 - m, m), inBlock(q, 1 - m, 1 - m), inBlock(q, m, 1 - m)].flat().map(Math.round));
      continue;
    }
    const k = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (rnd() < 0.18) continue;
        const m = 0.1, g = 0.04, s = (1 - 2 * m) / k;
        const u0 = m + i * s + g, u1 = m + (i + 1) * s - g, v0 = m + j * s + g, v1 = m + (j + 1) * s - g;
        buildings.push([inBlock(q, u0, v0), inBlock(q, u1, v0), inBlock(q, u1, v1), inBlock(q, u0, v1)].flat().map(Math.round));
      }
    }
  }
}

const at = (c: number, r: number) => ({ x: nodes[id(c, r) * 2] + 30, y: nodes[id(c, r) * 2 + 1] + 30 });
const pois: CityFile['pois'] = [
  { kind: 'fire', name: 'Caserne Centre', ...at(12, 4) },
  { kind: 'fire', name: 'Caserne Nord-Ouest', ...at(4, 2) },
  { kind: 'fire', name: 'Caserne Sud', ...at(15, 12) },
  { kind: 'hospital', name: 'CHU Pasteur', ...at(18, 3) },
  { kind: 'hospital', name: 'Hôpital Saint-Louis', ...at(6, 13) },
  { kind: 'police', name: 'Commissariat central', ...at(9, 6) },
  { kind: 'police', name: 'Commissariat Rive Sud', ...at(19, 14) },
];

// Districts and sensitive places (fixed positions: no random draw, so the
// streets above stay the same).
const rect = (c0: number, r0: number, c1: number, r1: number) =>
  [P(c0, r0), P(c1, r0), P(c1, r1), P(c0, r1)].flat().map(Math.round);
const zones: NonNullable<CityFile['zones']> = [
  { kind: 'industriel', name: 'ZI des Forges', pts: rect(17, 10, 22, 15) },
  { kind: 'industriel', name: 'Port fluvial', pts: rect(0, 6, 4, 9) },
  { kind: 'commercial', name: 'Centre commercial du Lac', pts: rect(2, 12, 6, 15) },
  { kind: 'commercial', name: 'Quartier des Halles', pts: rect(9, 3, 13, 5) },
  { kind: 'parc', name: 'Parc de la République', pts: rect(10, 6, 14, 8) },
];
const spot = (kind: NonNullable<CityFile['hotspots']>[number]['kind'], name: string, c: number, r: number) => ({ kind, name, ...at(c, r) });
const hotspots: NonNullable<CityFile['hotspots']> = [
  spot('bar', 'Le Central', 11, 4), spot('bar', 'Café des Sports', 13, 5), spot('bar', 'Le Zinc', 8, 3),
  spot('bar', 'Pub L\'Écluse', 6, 7), spot('bar', 'La Guinguette', 16, 10),
  spot('ecole', 'École Jules Ferry', 5, 3), spot('ecole', 'Collège Marie Curie', 15, 13), spot('ecole', 'Lycée Condorcet', 19, 5),
  spot('stade', 'Stade municipal', 8, 14), spot('ehpad', 'EHPAD Les Tilleuls', 3, 4), spot('ehpad', 'Résidence Bel Âge', 20, 13),
  spot('gare', 'Gare centrale', 12, 2),
];

const file: CityFile = {
  name: 'Ville de démonstration', source: 'demo', attribution: 'Ville générée (démo)',
  width: W, height: H, nodes, edges: keptEdges, names, water, parks, buildings, pois, zones, hotspots,
};
await Bun.write(new URL('../data/city.json', import.meta.url), JSON.stringify(file));
console.log(`data/city.json: ${n} nodes, ${keptEdges.length / 4} edges, ${buildings.length} buildings, ${parks.length} parks`);
