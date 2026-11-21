// On scene: the first crew's report may change the situation (a twist), and the
// player decides — reinforcements, make do, or evacuate now. Each choice has a
// price: time, chance of success, reward.
import { TWISTS } from './catalog/twists.ts';
import { UNITS, type UnitType } from './catalog/units.ts';
import { say } from './log.ts';
import type { Call, World } from './types.ts';

/** Game seconds the player has to decide before the crew makes do. */
export const DECISION_TIME = 4 * 60;

export type ChoiceId = 'renfort' | 'surplace' | 'evacuer';

export interface Choice {
  id: ChoiceId;
  label: string;
  detail: string;
  enabled: boolean;
}

const owns = (w: World, t: UnitType) => w.units.some((u) => u.type === t);
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
    call.decisionLeft = DECISION_TIME;
    call.state = 'bilan';
    say(w, `Bilan — ${call.address} : ${twist.report}`, 'alert', true);
    w.seq++;
    return;
  }
}

export function choices(w: World, call: Call): Choice[] {
  if (!call.twist) return [];
  const add = call.twist.add;
  const missing = add.filter((t) => !owns(w, t));
  const out: Choice[] = [
    {
      id: 'renfort', label: `Demander ${names(add)}`,
      detail: missing.length ? `Pas de ${names(missing)} dans votre flotte` : 'La bonne réponse : +30 % de prime si l\'intervention réussit',
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
    call.bonus = 1.3;
    call.deadline = Math.max(call.deadline, w.t + 14 * 60);
    say(w, `Renfort demandé : ${names(call.twist.add)} — ${call.address}.`, 'info');
  } else if (choice === 'surplace') {
    call.risk = 0.6;
    call.workLeft *= 1.5;
    say(w, `Les équipes font avec les moyens présents — ${call.address}.`, 'info');
  } else {
    call.risk = 0.75;
    call.bonus = 0.8;
    call.workLeft = Math.min(call.workLeft, 180);
    say(w, `Évacuation immédiate — ${call.address}.`, 'info');
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
    say(w, `Sans réponse de la salle, l'équipe fait avec ses moyens — ${call.address}.`, 'bad');
    decide(w, call, 'surplace');
  }
}
