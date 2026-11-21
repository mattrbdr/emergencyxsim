// The shift: calls come in, the player qualifies and dispatches, vehicles drive
// the real road graph, scenes are worked, victims go to hospital. Pure and
// deterministic: the same seed and the same commands replay the same shift.
import type { City } from './city.ts';
import {
  CALL_KINDS, FAMILY_LABEL, FLEET, POI_SERVICE, STATUS_LABEL, UNIT_TYPES,
  type CallKind, type Family, type Service, type UnitType,
} from './catalog.ts';
import { mulberry, pick, type Rng } from './rng.ts';
import { edgeBetween, edgeSpeed, pathTo, search, type Tree } from './routing.ts';

/** Game seconds per real second at ×1. */
export const TIME_SCALE = 15;
export const SHIFT_START = 7 * 3600;
export const SHIFT_LENGTH = 12 * 3600;
const HOSPITAL_BEDS = 6;

export type UnitStatus = 'dispo' | 'route' | 'surplace' | 'transport' | 'hopital' | 'retour';

export interface Unit {
  id: string;
  type: UnitType;
  service: Service;
  name: string;
  station: number;
  home: number;
  /** Nodes still to drive; path[0] is the node the unit left (or stands on). */
  path: number[];
  along: number;
  x: number;
  y: number;
  px: number;
  py: number;
  status: UnitStatus;
  callId: string;
  wait: number;
  missions: number;
}

export type CallState = 'nouveau' | 'attente' | 'engage' | 'traitement' | 'clos';

export interface Call {
  id: string;
  kind: CallKind;
  node: number;
  x: number;
  y: number;
  address: string;
  caller: string;
  at: number;
  deadline: number;
  priority: number;
  state: CallState;
  qualified: boolean;
  guessedRight: boolean;
  needs: UnitType[];
  assigned: string[];
  workLeft: number;
  escalated: boolean;
  outcome: '' | 'sauve' | 'perdu' | 'echec';
  firstOnScene: number;
  closedAt: number;
}

export interface LogEntry {
  id: number;
  t: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'alert';
}

export interface Pointer { x: number; y: number; sx: number; sy: number; moved: boolean }

export interface World {
  city: City;
  seed: number;
  rng: Rng;
  t: number;
  speed: number;
  paused: boolean;
  over: boolean;
  started: boolean;
  seq: number;
  units: Unit[];
  calls: Call[];
  nextCallAt: number;
  nextCallId: number;
  score: number;
  saved: number;
  lost: number;
  failed: number;
  cost: number;
  responses: number[];
  qualifyRight: number;
  qualifyWrong: number;
  log: LogEntry[];
  toast: LogEntry;
  logId: number;
  beds: number[];
  stationTrees: Map<number, Tree>;
  callTrees: Map<string, Tree>;
  cam: { cx: number; cy: number; zoom: number; tx: number; ty: number; tz: number; seq: number };
  view: { w: number; h: number };
  pointers: Map<number, Pointer>;
  pinch: { d: number; zoom: number } | null;
  camTouched: boolean;
}

const hhmm = (t: number) => {
  const s = Math.floor(SHIFT_START + t) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};
export const clockText = hhmm;

export function newWorld(city: City, seed: number): World {
  const rng = mulberry(seed || 1);
  const units: Unit[] = [];
  const seen: Record<string, number> = {};
  const counters: Record<string, number> = {};
  city.pois.forEach((poi, station) => {
    const index = seen[poi.kind] ?? 0;
    seen[poi.kind] = index + 1;
    const fleet = FLEET[poi.kind][Math.min(index, FLEET[poi.kind].length - 1)];
    for (const type of fleet) {
      counters[type] = (counters[type] ?? 0) + 1;
      units.push({
        id: `${type.toLowerCase()}${counters[type]}`, type, service: UNIT_TYPES[type].service,
        name: `${type} ${counters[type]}`, station, home: poi.node, path: [poi.node], along: 0,
        x: poi.x, y: poi.y, px: poi.x, py: poi.y, status: 'dispo', callId: '', wait: 0, missions: 0,
      });
    }
  });
  const fit = 1;
  const w: World = {
    city, seed, rng, t: 0, speed: 1, paused: false, over: false, started: false, seq: 0, units, calls: [],
    nextCallAt: 25, nextCallId: 1, score: 0, saved: 0, lost: 0, failed: 0, cost: 0, responses: [],
    qualifyRight: 0, qualifyWrong: 0, log: [], toast: { id: 0, t: 0, text: '', tone: 'info' }, logId: 0,
    beds: city.pois.map(() => 0), stationTrees: new Map(), callTrees: new Map(),
    cam: { cx: city.width / 2, cy: city.height / 2, zoom: fit, tx: city.width / 2, ty: city.height / 2, tz: fit, seq: 1 },
    view: { w: 0, h: 0 }, pointers: new Map(), pinch: null, camTouched: false,
  };
  say(w, `Prise de garde à ${city.name}. ${units.length} véhicules disponibles.`, 'info');
  return w;
}

function say(w: World, text: string, tone: LogEntry['tone'], toast = false) {
  const entry = { id: ++w.logId, t: w.t, text, tone };
  w.log.unshift(entry);
  if (w.log.length > 60) w.log.pop();
  if (toast) w.toast = entry;
}

// ---------------------------------------------------------------- traffic

/** Rush hours slow the big roads; a fixed per-street factor keeps routes varied. */
function trafficAt(w: World, edge: number): number {
  const hour = ((SHIFT_START + w.t) / 3600) % 24;
  const rush = Math.max(0, 1 - Math.abs(hour - 8.5) / 1.2) + Math.max(0, 1 - Math.abs(hour - 18) / 1.5);
  const cls = w.city.edges[edge].cls;
  const noise = ((edge * 2654435761) >>> 0) / 4294967296;
  return 1 + rush * (cls <= 1 ? 0.6 : 0.25) + noise * 0.2;
}

function treeFrom(w: World, node: number, cache?: Map<number, Tree>): Tree {
  const hit = cache?.get(node);
  if (hit) return hit;
  const tree = search(w.city, node, (e) => trafficAt(w, e));
  cache?.set(node, tree);
  return tree;
}

function callTree(w: World, call: Call): Tree {
  let tree = w.callTrees.get(call.id);
  if (!tree) {
    tree = search(w.city, call.node, (e) => trafficAt(w, e));
    w.callTrees.set(call.id, tree);
  }
  return tree;
}

/** The node a unit can be routed from: where it stands, or the end of the street it drives. */
const startNode = (u: Unit) => (u.path.length > 1 && u.along > 0 ? u.path[1] : u.path[0]);

function routeTo(u: Unit, tree: Tree) {
  const from = startNode(u);
  const way = pathTo(tree, from);
  u.path = u.path.length > 1 && u.along > 0 ? [u.path[0], ...way] : way;
  if (!(u.path.length > 1 && u.along > 0)) u.along = 0;
}

/** Seconds to finish the unit's path. */
export function etaOf(w: World, u: Unit): number {
  let s = 0;
  const kind = UNIT_TYPES[u.type];
  for (let i = 0; i + 1 < u.path.length; i++) {
    const ei = edgeBetween(w.city, u.path[i], u.path[i + 1]);
    if (ei < 0) continue;
    const e = w.city.edges[ei];
    const len = i === 0 ? e.len - u.along : e.len;
    s += (len / (edgeSpeed(e.cls) * kind.speed)) * trafficAt(w, ei);
  }
  return s;
}

export const isFree = (u: Unit) => u.status === 'dispo' || u.status === 'retour';

// ---------------------------------------------------------------- commands

export function qualify(w: World, callId: string, family: Family): boolean {
  const call = w.calls.find((c) => c.id === callId);
  if (!call || call.qualified) return false;
  call.qualified = true;
  call.guessedRight = call.kind.family === family;
  if (call.state === 'nouveau') call.state = 'attente';
  if (call.guessedRight) {
    w.qualifyRight++;
    w.score += 20;
    say(w, `${call.kind.title} qualifié, ${call.address}.`, 'info');
  } else {
    w.qualifyWrong++;
    w.score -= 30;
    say(w, `Requalification : c'était « ${call.kind.title} » (−30).`, 'bad', true);
  }
  w.seq++;
  return call.guessedRight;
}

export function dispatch(w: World, callId: string, unitIds: string[]): number {
  const call = w.calls.find((c) => c.id === callId);
  if (!call || call.state === 'clos' || call.state === 'traitement' && unitIds.length === 0) return 0;
  const tree = callTree(w, call);
  let sent = 0;
  for (const id of unitIds) {
    const u = w.units.find((x) => x.id === id);
    if (!u || !isFree(u)) continue;
    routeTo(u, tree);
    u.status = 'route';
    u.callId = call.id;
    u.missions++;
    call.assigned.push(u.id);
    w.cost += UNIT_TYPES[u.type].cost;
    sent++;
    if (u.path.length <= 1) arrive(w, u);
  }
  if (sent > 0) {
    if (!call.qualified) { call.qualified = true; call.guessedRight = true; }
    if (call.state === 'nouveau' || call.state === 'attente') call.state = 'engage';
    say(w, `${sent} ${sent > 1 ? 'véhicules engagés' : 'véhicule engagé'} sur ${call.kind.title.toLowerCase()}, ${call.address}.`, 'info');
    w.seq++;
  }
  return sent;
}

export function recall(w: World, unitId: string) {
  const u = w.units.find((x) => x.id === unitId);
  if (!u || u.status !== 'route') return;
  const call = w.calls.find((c) => c.id === u.callId);
  if (call) call.assigned = call.assigned.filter((x) => x !== u.id);
  goHome(w, u);
  say(w, `${u.name} désengagé, retour base.`, 'info');
}

/** The free unit types missing on a call, and the free units ranked by arrival time. */
export function options(w: World, callId: string) {
  const call = w.calls.find((c) => c.id === callId);
  if (!call || call.state === 'clos') return [];
  const tree = callTree(w, call);
  const missing = missingTypes(w, call);
  const free = w.units
    .filter(isFree)
    .map((u) => ({ u, eta: tree.time[startNode(u)] / UNIT_TYPES[u.type].speed + (u.along > 0 ? 10 : 0) }))
    .filter((o) => Number.isFinite(o.eta))
    .sort((a, b) => a.eta - b.eta);
  const suggested = new Set<string>();
  const want = [...missing];
  for (const o of free) {
    const k = want.indexOf(o.u.type);
    if (k >= 0) { want.splice(k, 1); suggested.add(o.u.id); }
  }
  return free.map((o) => ({ unit: o.u, eta: o.eta, suggested: suggested.has(o.u.id), needed: missing.includes(o.u.type) }));
}

/** Needed types not yet covered by an assigned unit (multiset difference). */
export function missingTypes(w: World, call: Call): UnitType[] {
  const want = [...call.needs];
  for (const id of call.assigned) {
    const u = w.units.find((x) => x.id === id);
    const k = u ? want.indexOf(u.type) : -1;
    if (k >= 0) want.splice(k, 1);
  }
  return want;
}

function onSceneTypes(w: World, call: Call): UnitType[] {
  return call.assigned
    .map((id) => w.units.find((x) => x.id === id)!)
    .filter((u) => u && u.status === 'surplace' && u.callId === call.id)
    .map((u) => u.type);
}

export function needState(w: World, call: Call): { type: UnitType; state: 'manque' | 'engage' | 'surplace' }[] {
  const scene = onSceneTypes(w, call);
  const assigned = call.assigned.map((id) => w.units.find((x) => x.id === id)?.type).filter(Boolean) as UnitType[];
  return call.needs.map((type) => {
    const s = scene.indexOf(type);
    if (s >= 0) { scene.splice(s, 1); assigned.splice(assigned.indexOf(type), 1); return { type, state: 'surplace' as const }; }
    const a = assigned.indexOf(type);
    if (a >= 0) { assigned.splice(a, 1); return { type, state: 'engage' as const }; }
    return { type, state: 'manque' as const };
  });
}

// ---------------------------------------------------------------- the tick

export function tick(w: World, realMs: number) {
  for (const u of w.units) { u.px = u.x; u.py = u.y; }
  if (!w.started || w.paused || w.over) return;
  let dt = (realMs / 1000) * TIME_SCALE * w.speed;
  // Sub-steps keep scenes and arrivals in order at ×4.
  while (dt > 0) {
    const step = Math.min(dt, 5);
    advance(w, step);
    dt -= step;
  }
  w.seq++;
}

function advance(w: World, dt: number) {
  w.t += dt;
  if (w.t >= SHIFT_LENGTH) {
    w.t = SHIFT_LENGTH;
    w.over = true;
    say(w, 'Fin de garde. Relève assurée.', 'info', true);
    return;
  }
  if (w.t >= w.nextCallAt) spawnCall(w);
  for (const u of w.units) moveUnit(w, u, dt);
  for (const call of w.calls) if (call.state !== 'clos') updateCall(w, call, dt);
  // Hospitals discharge one patient every 40 minutes.
  if (Math.floor((w.t - dt) / 2400) !== Math.floor(w.t / 2400)) w.beds = w.beds.map((b) => Math.max(0, b - 1));
  if (w.calls.length > 80) w.calls = w.calls.filter((c) => c.state !== 'clos' || w.t - c.closedAt < 1800);
  for (const key of [...w.callTrees.keys()]) {
    const c = w.calls.find((x) => x.id === key);
    if (!c || c.state === 'clos') w.callTrees.delete(key);
  }
}

function spawnCall(w: World) {
  const progress = w.t / SHIFT_LENGTH;
  const hour = ((SHIFT_START + w.t) / 3600) % 24;
  const busy = 1 + Math.max(0, 1 - Math.abs(hour - 12.5) / 2) * 0.5 + Math.max(0, 1 - Math.abs(hour - 18) / 1.5) * 0.7;
  const perHour = (6 + progress * 6) * busy;
  w.nextCallAt = w.t + (3600 / perHour) * (0.55 + w.rng() * 0.9);
  const active = w.calls.filter((c) => c.state !== 'clos');
  if (active.length >= 9) return;

  const total = CALL_KINDS.reduce((s, k) => s + k.weight, 0);
  let r = w.rng() * total;
  let kind = CALL_KINDS[0];
  for (const k of CALL_KINDS) { r -= k.weight; if (r <= 0) { kind = k; break; } }

  let edgeIndex = pick(w.rng, w.city.callEdges);
  for (let tries = 0; tries < 8; tries++) {
    const e = w.city.edges[edgeIndex];
    const near = active.some((c) => Math.hypot(c.x - w.city.nx[e.a], c.y - w.city.ny[e.a]) < 250);
    if (!near) break;
    edgeIndex = pick(w.rng, w.city.callEdges);
  }
  const e = w.city.edges[edgeIndex];
  const node = w.rng() < 0.5 ? e.a : e.b;
  const t = 0.2 + w.rng() * 0.6;
  const x = w.city.nx[e.a] + (w.city.nx[e.b] - w.city.nx[e.a]) * t;
  const y = w.city.ny[e.a] + (w.city.ny[e.b] - w.city.ny[e.a]) * t;
  const number = 1 + Math.floor(w.rng() * 140);
  const call: Call = {
    id: `c${w.nextCallId++}`, kind, node, x, y,
    address: `${number} ${w.city.file.names[e.name] ?? 'rue sans nom'}`,
    caller: pick(w.rng, kind.callers), at: w.t, deadline: w.t + kind.deadline * 60, priority: kind.priority,
    state: 'nouveau', qualified: false, guessedRight: false, needs: [...kind.needs], assigned: [], workLeft: kind.work * 60,
    escalated: false, outcome: '', firstOnScene: -1, closedAt: 0,
  };
  w.calls.push(call);
  say(w, `Appel ${call.priority === 1 ? 'URGENT ' : ''}: ${call.address}.`, call.priority === 1 ? 'alert' : 'info', true);
}

function moveUnit(w: World, u: Unit, dt: number) {
  if (u.status === 'hopital') {
    u.wait -= dt;
    if (u.wait <= 0) goHome(w, u);
    return;
  }
  if (u.path.length <= 1) return;
  const kind = UNIT_TYPES[u.type];
  let budget = dt;
  while (budget > 0 && u.path.length > 1) {
    const ei = edgeBetween(w.city, u.path[0], u.path[1]);
    if (ei < 0) { u.path.shift(); u.along = 0; continue; }
    const e = w.city.edges[ei];
    const v = (edgeSpeed(e.cls) * kind.speed) / trafficAt(w, ei);
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
  if (u.path.length > 1) {
    const b = u.path[1];
    const ei = edgeBetween(w.city, a, b);
    const f = ei >= 0 ? u.along / w.city.edges[ei].len : 0;
    u.x = w.city.nx[a] + (w.city.nx[b] - w.city.nx[a]) * f;
    u.y = w.city.ny[a] + (w.city.ny[b] - w.city.ny[a]) * f;
  } else {
    u.x = w.city.nx[a];
    u.y = w.city.ny[a];
    arrive(w, u);
  }
}

function arrive(w: World, u: Unit) {
  if (u.status === 'route') {
    const call = w.calls.find((c) => c.id === u.callId);
    if (!call || call.state === 'clos') { goHome(w, u); return; }
    u.status = 'surplace';
    if (call.firstOnScene < 0) {
      call.firstOnScene = w.t;
      w.responses.push(w.t - call.at);
    }
    say(w, `${u.name} sur les lieux, ${call.address}.`, 'info');
  } else if (u.status === 'transport') {
    u.status = 'hopital';
    u.wait = 240;
    const h = w.city.pois.findIndex((p) => p.kind === 'hospital' && p.node === u.path[0]);
    if (h >= 0) w.beds[h]++;
    say(w, `${u.name} arrivé à ${w.city.pois[h]?.name ?? 'l\'hôpital'}.`, 'good');
  } else if (u.status === 'retour') {
    u.status = 'dispo';
    u.callId = '';
  }
}

function goHome(w: World, u: Unit) {
  u.callId = '';
  if (startNode(u) === u.home && u.along === 0) {
    u.status = 'dispo';
    u.path = [u.home];
    return;
  }
  routeTo(u, treeFrom(w, u.home, w.stationTrees));
  u.status = u.path.length > 1 ? 'retour' : 'dispo';
}

function updateCall(w: World, call: Call, dt: number) {
  if (call.state === 'traitement') {
    call.workLeft -= dt;
    if (call.workLeft <= 0) finish(w, call);
    return;
  }
  const missing = [...call.needs];
  for (const type of onSceneTypes(w, call)) {
    const k = missing.indexOf(type);
    if (k >= 0) missing.splice(k, 1);
  }
  if (missing.length === 0 && call.needs.length > 0) {
    call.state = 'traitement';
    say(w, `${call.kind.title} : tous les moyens sont sur place, intervention en cours.`, 'info');
    return;
  }
  if (w.t < call.deadline) return;
  if (call.kind.escalate && !call.escalated) {
    call.escalated = true;
    call.needs = call.needs.concat(call.kind.escalate);
    call.deadline = w.t + 10 * 60;
    call.priority = 1;
    w.score -= 50;
    say(w, `Le feu se propage, ${call.address} ! Renforts nécessaires (−50).`, 'alert', true);
    return;
  }
  if (call.kind.victims > 0) {
    call.outcome = 'perdu';
    w.lost += call.kind.victims;
    w.score -= 150 * call.kind.victims;
    say(w, `${call.kind.title}, ${call.address} : secours arrivés trop tard (−${150 * call.kind.victims}).`, 'bad', true);
  } else {
    call.outcome = 'echec';
    w.failed++;
    w.score -= 60;
    say(w, `${call.kind.title}, ${call.address} : intervention manquée (−60).`, 'bad', true);
  }
  close(w, call);
}

function finish(w: World, call: Call) {
  call.outcome = 'sauve';
  const late = call.firstOnScene >= 0 ? Math.max(0, call.kind.deadline * 60 - (call.firstOnScene - call.at)) : 0;
  const gain = (call.priority === 1 ? 180 : call.priority === 2 ? 120 : 80) + Math.round(late / 60) * 4;
  w.score += gain;
  if (call.kind.victims > 0) w.saved += call.kind.victims;
  say(w, `${call.kind.title} terminé, ${call.address} (+${gain}).`, 'good', call.priority === 1);
  close(w, call, call.kind.transport);
}

function close(w: World, call: Call, transport = false) {
  call.state = 'clos';
  call.closedAt = w.t;
  let carrier: Unit | undefined;
  if (transport) {
    const scene = call.assigned.map((id) => w.units.find((x) => x.id === id)!).filter((u) => u && u.status === 'surplace');
    carrier = scene.find((u) => u.type === 'VSAV' || u.type === 'AMB') ?? scene.find((u) => u.type === 'SMUR');
  }
  for (const id of call.assigned) {
    const u = w.units.find((x) => x.id === id);
    if (!u || u.callId !== call.id) continue;
    if (u === carrier) toHospital(w, u);
    else goHome(w, u);
  }
}

function toHospital(w: World, u: Unit) {
  const tree = search(w.city, startNode(u), (e) => trafficAt(w, e));
  let best = -1, bestTime = Infinity;
  w.city.pois.forEach((p, i) => {
    if (p.kind !== 'hospital') return;
    const t = tree.time[p.node] + (w.beds[i] >= HOSPITAL_BEDS ? 1e6 : 0);
    if (t < bestTime) { bestTime = t; best = i; }
  });
  if (best < 0) { goHome(w, u); return; }
  const target = w.city.pois[best].node;
  // Reverse the search tree path: from the unit to the hospital.
  const way = pathTo(tree, target).reverse();
  u.path = u.along > 0 && u.path.length > 1 ? [u.path[0], ...way] : way;
  if (!(u.along > 0)) u.along = 0;
  u.status = 'transport';
  if (u.path.length <= 1) arrive(w, u);
  else say(w, `${u.name} évacue la victime vers ${w.city.pois[best].name}.`, 'info');
}

// ---------------------------------------------------------------- view model

export const familyLabel = (f: Family) => FAMILY_LABEL[f];
export const statusLabel = (s: UnitStatus) => STATUS_LABEL[s];
export const POI_SERVICES = POI_SERVICE;
