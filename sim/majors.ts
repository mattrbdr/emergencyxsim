// Major incidents: a scenario of phases. Each phase is a call (so dispatch,
// arrival, work and transport are the everyday ones); this module opens the
// phases in turn, asks the command decisions, carries crews over from one
// phase to the next, and settles the incident.
import { cue } from './fx.ts';
import { anyHas } from './upgrades.ts';
import type { CallKind } from './catalog/calls.ts';
import { MAJORS, type MajorKind } from './catalog/majors.ts';
import { RULES } from './catalog/rules.ts';
import { UNITS, type UnitType } from './catalog/units.ts';
import { createCall, spotOn, type Spot } from './callfactory.ts';
import { adjustReputation, earn, reputationFactor } from './economy.ts';
import { euros, say } from './log.ts';
import { placesAt } from './places.ts';
import { gainXp } from './progression.ts';
import type { Call, MajorChoice, World } from './types.ts';
import { freshTree } from './traffic.ts';
import { goHome, routeTo } from './units.ts';

export interface Major {
  id: string;
  kind: MajorKind;
  spot: Spot;
  phase: number;
  callId: string;
  /** People hurt so far (they add to the last phase's victims). */
  injured: number;
  /** Product of the decisions' reward multipliers. */
  bonus: number;
  /** People hurt if the chosen option fails. */
  atRisk: number;
  startedAt: number;
  state: 'actif' | 'reussi' | 'echec';
  endedAt: number;
  earned: number;
  /** Direction the wind blows the plume to (radians, screen axes). */
  wind: number;
  /** The vehicle on the run (pursuit): it drives the streets until two crews box it in. */
  fugitive: Fugitive | null;
  /** The second site of a twin attack (null for one site). */
  spot2: Spot | null;
}

export interface Fugitive {
  path: [number, number];
  along: number;
  x: number;
  y: number;
  px: number;
  py: number;
  heading: number;
  stopped: boolean;
  rerouteIn: number;
}

/** Metres per second of the vehicle on the run, and how close two crews must get. */
const FUGITIVE_SPEED = 11;
const INTERCEPT_RADIUS = 70;
const FLOOD_RADIUS = 380;

export interface MajorReport {
  id: string;
  title: string;
  success: boolean;
  injured: number;
  earned: number;
  minutes: number;
}

const COMMANDER = 'Commandant des opérations';

/** First major after about a day of play, then every 1.5 to 3 days. */
export const firstMajorAt = 20 * 3600;
const nextDelay = (w: World) => (1.5 + w.rng() * 1.5) * 86400;

export const activeMajor = (w: World) => w.majors.find((m) => m.state === 'actif');
export const majorOf = (w: World, call: Call) => (call.majorId ? w.majors.find((m) => m.id === call.majorId) : undefined);

function eligible(w: World): MajorKind[] {
  // The fleet must hold enough vehicles of each type for the first phase.
  const count = (t: UnitType) => w.units.filter((u) => u.type === t).length;
  const covered = (needs: UnitType[]) => needs.every((t) => count(t) >= needs.filter((x) => x === t).length);
  return MAJORS.filter((k) => k.level <= w.level && covered(k.phases[0].needs));
}

/** Called every step: starts an incident when one is due and none is running. */
export function updateMajors(w: World, dt: number) {
  const m = activeMajor(w);
  if (m?.fugitive && !m.fugitive.stopped && m.phase === 0) chase(w, m, dt);
  if (w.t < w.nextMajorAt || m) return;
  w.nextMajorAt = w.t + nextDelay(w);
  const last = w.majors.at(-1)?.kind.id;
  const all = eligible(w);
  const kinds = all.length > 1 ? all.filter((k) => k.id !== last) : all; // never the same one twice running
  if (kinds.length === 0) return;
  startMajor(w, kinds[Math.floor(w.rng() * kinds.length)]);
}

/** Where the current phase happens. */
export const siteOf = (m: Major): Spot => (m.kind.phases[m.phase]?.site && m.spot2 ? m.spot2 : m.spot);

/** A second site well across town from the first. */
function farSpot(w: World, kind: MajorKind, first: Spot): Spot {
  let best = pickSpot(w, kind);
  for (let i = 0; i < 6 && Math.hypot(best.x - first.x, best.y - first.y) < 1500; i++) best = pickSpot(w, kind);
  return best;
}

/** A street the incident is drawn to (a bank in a shopping district, a station…). */
function pickSpot(w: World, kind: MajorKind): Spot {
  let best = w.city.callEdges[0], bestScore = -1;
  for (let i = 0; i < 24; i++) {
    const edge = w.city.callEdges[Math.floor(w.rng() * w.city.callEdges.length)];
    const places = placesAt(w.city, edge);
    const score = kind.places.filter((p) => places.has(p)).length + w.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = edge; }
  }
  return spotOn(w, best);
}

export function startMajor(w: World, kind: MajorKind, spot = pickSpot(w, kind)): Major {
  const m: Major = {
    id: `m${w.nextId++}`, kind, spot, phase: 0, callId: '', injured: 0, bonus: 1, atRisk: 0,
    startedAt: w.t, state: 'actif', endedAt: 0, earned: 0, wind: w.rng() * Math.PI * 2, fugitive: null,
    spot2: kind.phases.some((p) => p.site) ? farSpot(w, kind, spot) : null,
  };
  w.majors.push(m);
  say(w, `ALERTE · ${kind.title} · ${spot.street}`, 'alert', true);
  cue(w, 'crise');
  if (kind.effect === 'flood') flood(w, m);
  openPhase(w, m, []);
  if (kind.effect === 'pursuit') {
    const next = w.city.adj[spot.node].map((e) => (w.city.edges[e].a === spot.node ? w.city.edges[e].b : w.city.edges[e].a))[0] ?? spot.node;
    m.fugitive = { path: [spot.node, next], along: 0, x: spot.x, y: spot.y, px: spot.x, py: spot.y, heading: 0, stopped: false, rerouteIn: 0 };
    const call = w.calls.find((c) => c.id === m.callId);
    if (call) call.hold = true;
  }
  return m;
}

/** The call a phase is played as. */
function phaseKind(m: Major): CallKind {
  const phase = m.kind.phases[m.phase];
  return {
    id: `${m.kind.id}:${phase.id}`, family: m.kind.family, title: `${m.kind.title} · ${phase.title}`,
    priority: 1, needs: [...phase.needs], deadline: phase.deadline, work: phase.work,
    victims: phase.transport ? phase.victims + m.injured : phase.victims, transport: phase.transport,
    weight: 0, callers: [phase.brief], level: m.kind.level, reward: 0, xp: 0,
  };
}

/** Opens the current phase; crews on scene whose type it may need stay on site. */
function openPhase(w: World, m: Major, onScene: string[]) {
  const phase = m.kind.phases[m.phase];
  const call = createCall(w, phaseKind(m), siteOf(m), m.phase === 0 ? m.kind.alert : phase.brief);
  call.majorId = m.id;
  call.qualified = true;
  call.guessedRight = true;
  call.twistRolled = true;
  call.state = 'attente';
  if (phase.decision) {
    call.state = 'bilan';
    call.prompt = { from: COMMANDER, report: phase.decision.report, options: phase.decision.options };
    call.decisionLeft = RULES.decisionTime;
  }
  const wanted: UnitType[] = phase.decision ? phase.decision.options.flatMap((o) => o.needs) : [...phase.needs];
  for (const id of onScene) {
    const u = w.units.find((x) => x.id === id);
    if (!u || !wanted.includes(u.type)) continue;
    u.callId = call.id;
    call.assigned.push(u.id);
    if (call.firstOnScene < 0) call.firstOnScene = w.t;
  }
  w.calls.push(call);
  m.callId = call.id;
  if (m.phase > 0) say(w, `${m.kind.title} · phase ${m.phase + 1}/${m.kind.phases.length} : ${phase.title.toLowerCase()}`, 'alert', true);
  w.seq++;
}

/** Choices for a phase's decision: enabled when the fleet has the vehicles. */
export function majorChoices(w: World, call: Call) {
  if (!call.prompt) return [];
  return call.prompt.options.map((o) => {
    const missing = o.needs.filter((t) => !w.units.some((u) => u.type === t));
    return {
      id: o.id, label: o.label,
      detail: missing.length ? `Pas de ${[...new Set(missing)].map((t) => UNITS[t].label).join(' ni de ')} dans votre flotte` : o.detail,
      enabled: missing.length === 0,
    };
  });
}

function apply(w: World, call: Call, option: MajorChoice) {
  const m = majorOf(w, call);
  const phase = m?.kind.phases[m.phase];
  call.needs = [...option.needs];
  call.workLeft = option.work * 60;
  call.risk = Math.min(1, option.success + (anyHas(w, 'salle_crise') ? 0.1 : 0));
  call.bonus = option.bonus;
  call.deadline = w.t + (phase?.deadline ?? 15) * 60;
  call.prompt = null;
  call.state = 'engage';
  if (m) m.atRisk = option.injuredOnFail;
  // Crews kept on site for an option not taken go home.
  for (const id of [...call.assigned]) {
    const u = w.units.find((x) => x.id === id);
    if (u && u.callId === call.id && !option.needs.includes(u.type)) {
      call.assigned = call.assigned.filter((x) => x !== id);
      goHome(w, u);
    }
  }
  say(w, `${call.street} · décision : ${option.label.toLowerCase()}`, 'info');
  w.seq++;
}

export function decideMajor(w: World, call: Call, optionId: string): boolean {
  const option = call.prompt?.options.find((o) => o.id === optionId);
  if (!option || !majorChoices(w, call).find((c) => c.id === optionId)?.enabled) return false;
  apply(w, call, option);
  return true;
}

/** No order from the room in time: the first option the fleet can do. */
export function majorDecisionTimeout(w: World, call: Call, dt: number) {
  call.decisionLeft -= dt;
  if (call.decisionLeft > 0 || !call.prompt) return;
  const enabled = majorChoices(w, call).find((c) => c.enabled);
  const option = call.prompt.options.find((o) => o.id === enabled?.id) ?? call.prompt.options[0];
  say(w, `${call.street} · sans ordre de la salle, le commandant choisit : ${option.label.toLowerCase()}`, 'bad');
  apply(w, call, option);
}

/**
 * A phase's call is closing (before its crews leave): move on to the next
 * phase, carrying crews over, or settle the incident. `carrier` is the vehicle
 * taking a victim to hospital (it never stays).
 */
export function endPhase(w: World, call: Call, carrier: string | undefined) {
  const m = majorOf(w, call);
  if (!m || m.state !== 'actif') return;
  const phase = m.kind.phases[m.phase];
  const last = m.phase === m.kind.phases.length - 1;
  if (call.outcome === 'sauve') {
    m.bonus *= call.bonus;
  } else if (phase.onFail === 'abort') {
    settle(w, m, false);
    return;
  } else {
    m.injured += call.risk < 1 ? m.atRisk : phase.injuredOnFail;
    if (last) { settle(w, m, false); return; }
  }
  if (last) { settle(w, m, true); return; }
  m.phase++;
  const moved = (m.kind.phases[m.phase].site ?? 0) !== (phase.site ?? 0);
  const onScene = moved ? [] : call.assigned.filter((id) => {
    const u = w.units.find((x) => x.id === id);
    return id !== carrier && u?.callId === call.id && u.status === 'surplace';
  });
  openPhase(w, m, onScene);
}

function settle(w: World, m: Major, success: boolean) {
  m.state = success ? 'reussi' : 'echec';
  m.endedAt = w.t;
  if (success && !w.records.crisesWon.includes(m.kind.id)) w.records.crisesWon.push(m.kind.id);
  if (w.blocked.size) {
    w.blocked.clear();
    w.stationTrees.clear();
    w.callTrees.clear();
  }
  if (success) {
    const gross = m.kind.reward * m.bonus * reputationFactor(w);
    m.earned = Math.round(Math.max(gross * 0.3, gross - m.injured * 1500) / 10) * 10;
    earn(w, m.earned);
    gainXp(w, m.kind.xp);
    adjustReputation(w, m.injured === 0 ? 6 : 3);
    say(w, `${m.kind.title} · terminé · ${m.injured} blessé${m.injured > 1 ? 's' : ''} · +${euros(m.earned)}, +${m.kind.xp} XP`, 'money', true);
  } else {
    adjustReputation(w, -8);
    say(w, `${m.kind.title} · échec de l'opération`, 'bad', true);
  }
  w.majorReport = {
    id: m.id, title: m.kind.title, success, injured: m.injured, earned: m.earned,
    minutes: Math.round((w.t - m.startedAt) / 60),
  };
  w.dirty = true;
}

// ---------------------------------------------------------------- special mechanics

/** Flash flood: the side streets around the site are cut; main roads stay passable. */
function flood(w: World, m: Major) {
  const { city } = w;
  city.edges.forEach((e, i) => {
    if (e.cls <= 1 || e.a === m.spot.node || e.b === m.spot.node) return;
    const x = (city.nx[e.a] + city.nx[e.b]) / 2, y = (city.ny[e.a] + city.ny[e.b]) / 2;
    if (Math.hypot(x - m.spot.x, y - m.spot.y) < FLOOD_RADIUS) w.blocked.add(i);
  });
  w.stationTrees.clear();
  w.callTrees.clear();
}

/** Pursuit: the vehicle drives on; crews are routed to where it goes; two close crews stop it. */
function chase(w: World, m: Major, dt: number) {
  const f = m.fugitive!;
  const { city } = w;
  const call = w.calls.find((c) => c.id === m.callId);
  f.px = f.x;
  f.py = f.y;
  let budget = (FUGITIVE_SPEED / w.trafficMul) * dt; // rain and snow slow it too
  while (budget > 0) {
    const [a, b] = f.path;
    const len = Math.hypot(city.nx[b] - city.nx[a], city.ny[b] - city.ny[a]) || 1;
    if (f.along + budget < len) { f.along += budget; budget = 0; break; }
    budget -= len - f.along;
    // At a crossing: carry on, preferring big roads, never straight back.
    const ways = city.adj[b].map((ei) => city.edges[ei]).filter((e) => (e.a === b ? e.b : e.a) !== a);
    // Random keys drawn once, so the sort stays consistent (and the replay exact).
    const keyed = ways.map((e) => ({ e, k: e.cls + (w.rng() - 0.5) * 2 }));
    const pick = keyed.length ? keyed.reduce((best, x) => (x.k < best.k ? x : best)).e : null;
    f.path = [b, pick ? (pick.a === b ? pick.b : pick.a) : a];
    f.along = 0;
  }
  const [a, b] = f.path;
  const len = Math.hypot(city.nx[b] - city.nx[a], city.ny[b] - city.ny[a]) || 1;
  f.x = city.nx[a] + ((city.nx[b] - city.nx[a]) * f.along) / len;
  f.y = city.ny[a] + ((city.ny[b] - city.ny[a]) * f.along) / len;
  f.heading = Math.atan2(city.ny[b] - city.ny[a], city.nx[b] - city.nx[a]);
  if (!call) return;
  call.x = f.x;
  call.y = f.y;
  call.node = b;
  const crews = w.units.filter((u) => u.callId === call.id && (u.status === 'route' || u.status === 'surplace'));
  const close = crews.filter((u) => Math.hypot(u.x - f.x, u.y - f.y) < INTERCEPT_RADIUS);
  if (close.length >= 2) {
    f.stopped = true;
    call.hold = false;
    m.spot = { ...m.spot, x: f.x, y: f.y, node: b }; // the next phase happens where it stopped
    for (const u of close) {
      u.status = 'surplace';
      u.path = [u.path[u.path.length - 1]];
      u.along = 0;
      u.x = f.x;
      u.y = f.y;
    }
    if (call.firstOnScene < 0) call.firstOnScene = w.t;
    say(w, `Véhicule intercepté · ${close.map((u) => u.name).join(', ')}`, 'good', true);
    return;
  }
  f.rerouteIn -= dt;
  if (f.rerouteIn > 0) return;
  f.rerouteIn = 15;
  w.callTrees.delete(call.id);
  const tree = freshTree(w, b);
  for (const u of crews) {
    u.status = 'route';
    routeTo(u, tree);
  }
}
