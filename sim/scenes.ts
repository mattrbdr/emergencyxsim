// On scene: the first crew's report may change the situation (a twist), and the
// player decides — reinforcements, make do, or evacuate now. Each choice has a
// price: time, chance of success, reward.
import { TWISTS } from './catalog/twists.ts';
import { UNITS, type UnitType } from './catalog/units.ts';
import { say } from './log.ts';
import type { Call, World } from './types.ts';

import { RULES } from './catalog/rules.ts';

export type ChoiceId = 'renfort' | 'surplace' | 'evacuer';

export interface Choice {
  id: ChoiceId;
  label: string;
  detail: string;
  enabled: boolean;
}

/** Types the fleet cannot spare: it has no vehicle of that type beyond those already on this call. */
function unavailable(w: World, call: Call, add: UnitType[]): UnitType[] {
  const spare = (t: UnitType) => w.units.filter((u) => u.type === t && u.callId !== call.id).length;
  const want: Partial<Record<UnitType, number>> = {};
  for (const t of add) want[t] = (want[t] ?? 0) + 1;
  return (Object.keys(want) as UnitType[]).filter((t) => spare(t) < want[t]!);
}
const names = (types: UnitType[]) => [...new Set(types)].map((t) => UNITS[t].label).join(' + ');

/** Called once, the first time a call has a vehicle on scene. */
export function rollTwist(w: World, call: Call) {
  call.twistRolled = true;
  for (const twist of TWISTS[call.kind.id] ?? []) {
    // Only what the player could ever send: no SMUR twist before level 6.
    if (twist.add.some((t) => UNITS[t].level > w.level)) continue;
    if (w.rng() >= twist.chance) continue;
    const crew = w.units.find((u) => u.callId === call.id && u.status === 'surplace');
    call.twist = { id: twist.id, report: twist.report, add: twist.add, from: crew?.name ?? 'Le premier engin' };
    call.decisionLeft = RULES.decisionTime;
    call.state = 'bilan';
    say(w, `${call.twist.from} · ${call.street} : ${twist.report}`, 'alert', true);
    w.seq++;
    return;
  }
}

export function choices(w: World, call: Call): Choice[] {
  if (!call.twist) return [];
  const add = call.twist.add;
  const missing = unavailable(w, call, add);
  const out: Choice[] = [
    {
      id: 'renfort', label: `Demander ${names(add)}`,
      detail: missing.length ? `Aucun ${names(missing)} de plus dans votre flotte` : 'Le plus sûr. Prime +30 % si l\'intervention réussit',
      enabled: missing.length === 0,
    },
    { id: 'surplace', label: 'Faire avec les moyens présents', detail: '60 % de réussite, intervention 50 % plus longue', enabled: true },
  ];
  if (call.kind.transport && call.kind.victims > 0) {
    out.push({ id: 'evacuer', label: 'Évacuer immédiatement', detail: '75 % de réussite, prime réduite de 20 %', enabled: true });
  }
  return out;
}

export function decide(w: World, call: Call, choice: ChoiceId): boolean {
  if (call.state !== 'bilan' || !call.twist) return false;
  const option = choices(w, call).find((c) => c.id === choice);
  if (!option || !option.enabled) return false;
  if (choice === 'renfort') {
    call.needs = call.needs.concat(call.twist.add);
    call.bonus = RULES.reinforcement.bonus;
    call.deadline = Math.max(call.deadline, w.t + RULES.reinforcement.extraTime);
    say(w, `Demande de renfort ${names(call.twist.add)} · ${call.street}`, 'info');
  } else if (choice === 'surplace') {
    call.risk = RULES.makeDo.success;
    call.workLeft *= RULES.makeDo.workFactor;
    say(w, `${call.street} · poursuite avec les moyens sur place`, 'info');
  } else {
    call.risk = RULES.evacuate.success;
    call.bonus = RULES.evacuate.bonus;
    call.workLeft = Math.min(call.workLeft, RULES.evacuate.maxWork);
    say(w, `${call.street} · évacuation immédiate demandée`, 'info');
  }
  call.twist = null;
  call.state = 'engage';
  w.seq++;
  return true;
}

/** No answer in time: the crew makes do. */
export function decisionTimeout(w: World, call: Call, dt: number) {
  call.decisionLeft -= dt;
  if (call.decisionLeft <= 0) {
    say(w, `${call.street} · sans ordre de la salle, l'équipe poursuit avec ses moyens`, 'bad');
    decide(w, call, 'surplace');
  }
}
