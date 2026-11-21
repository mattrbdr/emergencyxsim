// The life of a call: it comes in, the player qualifies it, dispatches, the
// scene is worked, and it closes saved, lost or failed.
import { CALL_KINDS, type Family } from './catalog/calls.ts';
import { UNITS, type UnitType } from './catalog/units.ts';
import { hourOf } from './clock.ts';
import { adjustReputation, earn, reward } from './economy.ts';
import { euros, say } from './log.ts';
import { gainXp } from './progression.ts';
import { pick } from './rng.ts';
import { landmark, pickStreet } from './places.ts';
import { decisionTimeout, rollTwist } from './scenes.ts';
import { recordCall } from './contracts.ts';
import { treeFromCall } from './traffic.ts';
import type { Call, World } from './types.ts';
import { etaFrom, goHome, isFree, sendTo, toHospital } from './units.ts';

const MAX_ACTIVE = 10;

// ---------------------------------------------------------------- arrivals

/** Calls per game hour: more vehicles, more calls; fewer at night; reputation draws work. */
export function callsPerHour(w: World): number {
  const hour = hourOf(w.t);
  const night = hour < 6 || hour >= 23 ? 0.55 : 1;
  const busy = 1 + Math.max(0, 1 - Math.abs(hour - 12.5) / 2) * 0.3 + Math.max(0, 1 - Math.abs(hour - 18) / 1.5) * 0.5;
  return (2 + w.units.length * 1.1) * night * busy * (0.6 + w.reputation / 125);
}

export function spawnCall(w: World) {
  w.nextCallAt = w.t + (3600 / callsPerHour(w)) * (0.55 + w.rng() * 0.9);
  const active = w.calls.filter((c) => c.state !== 'clos');
  if (w.buildings.length === 0 || active.length >= MAX_ACTIVE) return;

  // A kind of call comes in once the fleet has every type it needs: buying a
  // vehicle opens its interventions.
  const owned = new Set(w.units.map((u) => u.type));
  const kinds = CALL_KINDS.filter((k) => k.level <= w.level && k.needs.every((t) => owned.has(t)));
  if (kinds.length === 0) return;
  const weight = (k: (typeof kinds)[number]) => k.weight;
  const total = kinds.reduce((s, k) => s + weight(k), 0);
  let r = w.rng() * total;
  let kind = kinds[0];
  for (const k of kinds) { r -= weight(k); if (r <= 0) { kind = k; break; } }

  const edgeIndex = pickStreet(w.city, kind, w.rng, (edge) => {
    const e = w.city.edges[edge];
    return active.some((c) => Math.hypot(c.x - w.city.nx[e.a], c.y - w.city.ny[e.a]) < 250);
  });
  const e = w.city.edges[edgeIndex];
  const f = 0.2 + w.rng() * 0.6;
  const call: Call = {
    id: `c${w.nextId++}`, kind,
    node: w.rng() < 0.5 ? e.a : e.b,
    x: w.city.nx[e.a] + (w.city.nx[e.b] - w.city.nx[e.a]) * f,
    y: w.city.ny[e.a] + (w.city.ny[e.b] - w.city.ny[e.a]) * f,
    address: '',
    caller: pick(w.rng, kind.callers), at: w.t, deadline: w.t + kind.deadline * 60, priority: kind.priority,
    state: 'nouveau', qualified: false, guessedRight: false, needs: [...kind.needs], assigned: [],
    workLeft: kind.work * 60, escalated: false, outcome: '', firstOnScene: -1, closedAt: 0, earned: 0,
    twistRolled: false, twist: null, decisionLeft: 0, risk: 1, bonus: 1,
  };
  const street = `${1 + Math.floor(w.rng() * 140)} ${w.city.file.names[e.name] ?? 'rue sans nom'}`;
  const near = landmark(w.city, kind, call.x, call.y);
  call.address = near ? `${near}, ${street}` : street;
  w.calls.push(call);
  w.stats.calls++;
  say(w, `Appel ${call.priority === 1 ? 'URGENT ' : ''}— ${call.address}.`, call.priority === 1 ? 'alert' : 'info', true);
}

// ---------------------------------------------------------------- commands

export const findCall = (w: World, id: string) => w.calls.find((c) => c.id === id);

export function qualify(w: World, callId: string, family: Family): boolean {
  const call = findCall(w, callId);
  if (!call || call.qualified) return false;
  call.qualified = true;
  call.guessedRight = call.kind.family === family;
  if (call.state === 'nouveau') call.state = 'attente';
  if (call.guessedRight) {
    w.stats.qualifyRight++;
    w.dayStats.qualifyRight++;
    gainXp(w, 5);
    say(w, `Qualifié : ${call.kind.title.toLowerCase()}.`, 'info');
  } else {
    w.stats.qualifyWrong++;
    adjustReputation(w, -2);
    say(w, `Requalifié : c'était « ${call.kind.title} ». Réputation −2.`, 'bad', true);
  }
  w.seq++;
  return call.guessedRight;
}

export function dispatch(w: World, callId: string, unitIds: string[]): number {
  const call = findCall(w, callId);
  if (!call || call.state === 'clos') return 0;
  const tree = treeFromCall(w, call);
  let sent = 0;
  for (const id of unitIds) {
    const u = w.units.find((x) => x.id === id);
    if (!u || !isFree(u)) continue;
    sendTo(w, u, tree, call.x, call.y);
    u.status = 'route';
    u.callId = call.id;
    u.missions++;
    call.assigned.push(u.id);
    sent++;
  }
  if (sent > 0) {
    if (!call.qualified) { call.qualified = true; call.guessedRight = true; }
    if (call.state === 'nouveau' || call.state === 'attente') call.state = 'engage';
    say(w, `${sent} ${sent > 1 ? 'véhicules engagés' : 'véhicule engagé'} — ${call.address}.`, 'info');
    w.seq++;
  }
  return sent;
}

export function recall(w: World, unitId: string) {
  const u = w.units.find((x) => x.id === unitId);
  if (!u || u.status !== 'route') return;
  const call = findCall(w, u.callId);
  if (call) call.assigned = call.assigned.filter((x) => x !== u.id);
  goHome(w, u);
  say(w, `${u.name} désengagé.`, 'info');
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

/** Free units ranked by arrival time; the fastest of each missing type are suggested. */
export function options(w: World, callId: string) {
  const call = findCall(w, callId);
  if (!call || call.state === 'clos') return [];
  const tree = treeFromCall(w, call);
  const missing = missingTypes(w, call);
  const free = w.units
    .filter(isFree)
    .map((u) => ({ unit: u, eta: etaFrom(w, u, tree, call.x, call.y) }))
    .filter((o) => Number.isFinite(o.eta))
    .sort((a, b) => a.eta - b.eta);
  const want = [...missing];
  const suggested = new Set<string>();
  for (const o of free) {
    const k = want.indexOf(o.unit.type);
    if (k >= 0) { want.splice(k, 1); suggested.add(o.unit.id); }
  }
  return free.map((o) => ({ ...o, suggested: suggested.has(o.unit.id), needed: missing.includes(o.unit.type) }));
}

function onSceneTypes(w: World, call: Call): UnitType[] {
  return call.assigned
    .map((id) => w.units.find((x) => x.id === id))
    .filter((u) => u && u.status === 'surplace' && u.callId === call.id)
    .map((u) => u!.type);
}

export function needState(w: World, call: Call) {
  const scene = onSceneTypes(w, call);
  const assigned = call.assigned.map((id) => w.units.find((x) => x.id === id)?.type).filter(Boolean) as UnitType[];
  return call.needs.map((type) => {
    const s = scene.indexOf(type);
    if (s >= 0) {
      scene.splice(s, 1);
      assigned.splice(assigned.indexOf(type), 1);
      return { type, state: 'surplace' as const };
    }
    const a = assigned.indexOf(type);
    if (a >= 0) { assigned.splice(a, 1); return { type, state: 'engage' as const }; }
    return { type, state: 'manque' as const };
  });
}

// ---------------------------------------------------------------- the scene

export function updateCall(w: World, call: Call, dt: number) {
  if (call.state === 'traitement') {
    call.workLeft -= dt;
    if (call.workLeft <= 0) finish(w, call);
    return;
  }
  if (call.state === 'bilan') {
    decisionTimeout(w, call, dt);
    return;
  }
  if (!call.twistRolled && call.firstOnScene >= 0) {
    rollTwist(w, call);
    if ((call.state as Call['state']) === 'bilan') return; // rollTwist may have changed it
  }
  const missing = [...call.needs];
  for (const type of onSceneTypes(w, call)) {
    const k = missing.indexOf(type);
    if (k >= 0) missing.splice(k, 1);
  }
  if (missing.length === 0) {
    call.state = 'traitement';
    say(w, `${call.kind.title} : moyens au complet, intervention en cours.`, 'info');
    return;
  }
  if (w.t < call.deadline) return;
  if (call.kind.escalate && !call.escalated) {
    call.escalated = true;
    call.needs = call.needs.concat(call.kind.escalate);
    call.deadline = w.t + 10 * 60;
    call.priority = 1;
    adjustReputation(w, -3);
    say(w, `Le feu se propage — ${call.address}. Renforts ${call.kind.escalate.map((t) => UNITS[t].label).join(', ')} nécessaires.`, 'alert', true);
    return;
  }
  if (call.kind.victims > 0) {
    call.outcome = 'perdu';
    w.stats.lost += call.kind.victims;
    adjustReputation(w, -4 * call.kind.victims);
    say(w, `${call.kind.title}, ${call.address} : secours arrivés trop tard.`, 'bad', true);
  } else {
    call.outcome = 'echec';
    w.stats.failed++;
    adjustReputation(w, -3);
    say(w, `${call.kind.title}, ${call.address} : intervention manquée.`, 'bad', true);
  }
  close(w, call);
}

function finish(w: World, call: Call) {
  // A risky decision may fail.
  if (call.risk < 1 && w.rng() > call.risk) {
    if (call.kind.victims > 0) {
      call.outcome = 'perdu';
      w.stats.lost += call.kind.victims;
      adjustReputation(w, -4 * call.kind.victims);
      say(w, `${call.kind.title}, ${call.address} : malgré les efforts, la victime n'a pas survécu.`, 'bad', true);
    } else {
      call.outcome = 'echec';
      w.stats.failed++;
      adjustReputation(w, -3);
      say(w, `${call.kind.title}, ${call.address} : les moyens étaient insuffisants.`, 'bad', true);
    }
    close(w, call);
    return;
  }
  call.outcome = 'sauve';
  const early = call.firstOnScene >= 0 ? Math.max(0, call.deadline - call.firstOnScene) : 0;
  const money = Math.round(reward(w, call.kind, early) * call.bonus);
  call.earned = money;
  earn(w, money);
  gainXp(w, call.kind.xp);
  adjustReputation(w, call.priority === 1 ? 2 : 1);
  if (call.kind.victims > 0) w.stats.saved += call.kind.victims;
  say(w, `${call.kind.title} terminé — +${euros(money)}, +${call.kind.xp} XP.`, 'money', call.priority === 1);
  close(w, call, call.kind.transport);
}

function close(w: World, call: Call, transport = false) {
  call.state = 'clos';
  call.closedAt = w.t;
  recordCall(w, call);
  let carrier: string | undefined;
  if (transport) {
    const scene = call.assigned
      .map((id) => w.units.find((x) => x.id === id))
      .filter((u) => u && u.status === 'surplace' && u.callId === call.id);
    carrier = (scene.find((u) => u!.type === 'HELI') ?? scene.find((u) => UNITS[u!.type].carries))?.id;
  }
  for (const id of call.assigned) {
    const u = w.units.find((x) => x.id === id);
    if (!u || u.callId !== call.id) continue;
    if (u.id === carrier) toHospital(w, u);
    else goHome(w, u);
  }
  w.dirty = true;
}
