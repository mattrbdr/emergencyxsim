// Vehicles on the move: driving the road graph (or flying straight), arriving
// on scene, carrying victims to hospital, going home.
import { RULES } from './catalog/rules.ts';
import { UNITS, type UnitDef } from './catalog/units.ts';
import { earn } from './economy.ts';
import { euros, say } from './log.ts';
import { edgeBetween, edgeSpeed, pathTo, type Tree } from './routing.ts';
import { freshTree, trafficAt, treeFromStation } from './traffic.ts';
import type { Unit, World } from './types.ts';

export const isFree = (u: Unit) => u.status === 'dispo' || u.status === 'retour';
/** Traffic slowdown for this vehicle: a motorbike weaves through half of it. */
const jam = (w: World, def: UnitDef, edge: number) => (def.weaves ? 1 + (trafficAt(w, edge) - 1) / 2 : trafficAt(w, edge));
export const flies = (u: Unit) => UNITS[u.type].flySpeed !== undefined;

/** The node a road unit can be routed from: where it stands, or the end of the street it drives. */
export const startNode = (u: Unit) => (u.path.length > 1 && u.along > 0 ? u.path[1] : u.path[0]);

/** Follow a search tree back to its source. */
export function routeTo(u: Unit, tree: Tree) {
  const way = pathTo(tree, startNode(u));
  const midStreet = u.path.length > 1 && u.along > 0;
  u.path = midStreet ? [u.path[0], ...way] : way;
  if (!midStreet) u.along = 0;
}

/** Seconds a unit needs from where it is to `tree`'s source (or to a point, flying). */
export function etaFrom(u: Unit, tree: Tree, x: number, y: number): number {
  const def = UNITS[u.type];
  if (def.flySpeed) return Math.hypot(u.x - x, u.y - y) / def.flySpeed + 60; // take-off
  return tree.time[startNode(u)] / def.speed + (u.along > 0 ? 10 : 0);
}

/** Seconds to finish the current trip. */
export function etaOf(w: World, u: Unit): number {
  const def = UNITS[u.type];
  if (u.flight) return Math.hypot(u.flight.x - u.x, u.flight.y - u.y) / (def.flySpeed ?? 50);
  let s = 0;
  for (let i = 0; i + 1 < u.path.length; i++) {
    const ei = edgeBetween(w.city, u.path[i], u.path[i + 1]);
    if (ei < 0) continue;
    const e = w.city.edges[ei];
    const len = i === 0 ? e.len - u.along : e.len;
    s += (len / (edgeSpeed(e.cls) * def.speed)) * jam(w, def, ei);
  }
  return s;
}

export function sendTo(u: Unit, tree: Tree, x: number, y: number) {
  if (flies(u)) u.flight = { x, y };
  else routeTo(u, tree);
}

export function moveUnit(w: World, u: Unit, dt: number) {
  if (u.status === 'hopital') {
    u.wait -= dt;
    if (u.wait <= 0) goHome(w, u);
    return;
  }
  if (u.flight) {
    const v = UNITS[u.type].flySpeed ?? 50;
    const dx = u.flight.x - u.x, dy = u.flight.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d <= v * dt) {
      u.x = u.flight.x;
      u.y = u.flight.y;
      u.flight = null;
      arrive(w, u);
    } else {
      u.x += (dx / d) * v * dt;
      u.y += (dy / d) * v * dt;
      u.heading = Math.atan2(dy, dx);
    }
    return;
  }
  if (u.path.length <= 1) return;
  const def = UNITS[u.type];
  let budget = dt;
  while (budget > 0 && u.path.length > 1) {
    const ei = edgeBetween(w.city, u.path[0], u.path[1]);
    if (ei < 0) { u.path.shift(); u.along = 0; continue; }
    const e = w.city.edges[ei];
    const v = (edgeSpeed(e.cls) * def.speed) / jam(w, def, ei);
    const left = e.len - u.along;
    if (budget * v >= left) {
      budget -= left / v;
      u.path.shift();
      u.along = 0;
    } else {
      u.along += budget * v;
      budget = 0;
    }
  }
  const a = u.path[0];
  const { nx, ny } = w.city;
  if (u.path.length > 1) {
    const b = u.path[1];
    const ei = edgeBetween(w.city, a, b);
    const f = ei >= 0 ? u.along / w.city.edges[ei].len : 0;
    u.x = nx[a] + (nx[b] - nx[a]) * f;
    u.y = ny[a] + (ny[b] - ny[a]) * f;
    u.heading = Math.atan2(ny[b] - ny[a], nx[b] - nx[a]);
  } else {
    u.x = nx[a];
    u.y = ny[a];
    arrive(w, u);
  }
}

export function arrive(w: World, u: Unit) {
  if (u.status === 'route') {
    const call = w.calls.find((c) => c.id === u.callId);
    if (!call || call.state === 'clos') { goHome(w, u); return; }
    u.status = 'surplace';
    if (call.firstOnScene < 0) {
      call.firstOnScene = w.t;
      w.stats.responseSum += w.t - call.at;
      w.stats.responses++;
    }
    say(w, `${u.name} · statut 3 · ${call.street}`, 'info');
  } else if (u.status === 'transport') {
    u.status = 'hopital';
    u.wait = RULES.hospitalStay;
    const own = w.buildings.find((b) => b.kind === 'hopital' && Math.hypot(b.x - u.x, b.y - u.y) < 40);
    if (own) {
      own.patients++;
      earn(w, RULES.ownHospitalFee);
      say(w, `${u.name} · statut 5 · ${own.name}, soins facturés +${euros(RULES.ownHospitalFee)}`, 'money');
    } else {
      say(w, `${u.name} · statut 5 · victime déposée aux urgences`, 'good');
    }
  } else if (u.status === 'retour') {
    u.status = 'dispo';
    u.callId = '';
  }
}

export function goHome(w: World, u: Unit) {
  u.callId = '';
  const home = w.buildings.find((b) => b.id === u.building);
  if (!home) return;
  if (flies(u)) {
    u.status = 'retour';
    u.flight = { x: home.x, y: home.y };
    return;
  }
  if (startNode(u) === u.home && u.along === 0) {
    u.status = 'dispo';
    u.path = [u.home];
    return;
  }
  routeTo(u, treeFromStation(w, u.home));
  u.status = u.path.length > 1 ? 'retour' : 'dispo';
  if (u.status === 'dispo') { u.x = home.x; u.y = home.y; }
}

/** Hospitals a victim can go to: the player's and the city's public ones. */
export function hospitals(w: World): { x: number; y: number; node: number; name: string }[] {
  const own = w.buildings.filter((b) => b.kind === 'hopital');
  const pub = w.city.pois.filter((p, i) => p.kind === 'hospital' && !w.buildings.some((b) => b.site === i));
  return [...own, ...pub];
}

export function toHospital(w: World, u: Unit) {
  const list = hospitals(w);
  if (list.length === 0) { goHome(w, u); return; }
  u.status = 'transport';
  if (flies(u)) {
    const h = list.reduce((a, b) => (Math.hypot(a.x - u.x, a.y - u.y) <= Math.hypot(b.x - u.x, b.y - u.y) ? a : b));
    u.flight = { x: h.x, y: h.y };
    say(w, `${u.name} · statut 4 · transport vers ${h.name}`, 'info');
    return;
  }
  const tree = freshTree(w, startNode(u));
  // Prefer the player's own hospital when it is not much further.
  const score = (h: (typeof list)[number]) => tree.time[h.node] * (w.buildings.some((b) => b.node === h.node && b.kind === 'hopital') ? 0.7 : 1);
  const best = list.reduce((a, b) => (score(a) <= score(b) ? a : b));
  const way = pathTo(tree, best.node).reverse();
  const midStreet = u.along > 0 && u.path.length > 1;
  u.path = midStreet ? [u.path[0], ...way] : way;
  if (!midStreet) u.along = 0;
  if (u.path.length <= 1) arrive(w, u);
  else say(w, `${u.name} · statut 4 · transport vers ${best.name}`, 'info');
}
