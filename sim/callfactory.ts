// Building a call at a place: position along a street, address (landmark,
// floor and door code for homes). Used for everyday calls and for the phases
// of major incidents.
import type { CallKind } from './catalog/calls.ts';
import { landmark } from './places.ts';
import { pick } from './rng.ts';
import type { Call, World } from './types.ts';

export interface Spot { node: number; x: number; y: number; street: string; edgeName: number }

/** A point along street `edge`, with a house number. */
export function spotOn(w: World, edge: number): Spot {
  const e = w.city.edges[edge];
  const f = 0.2 + w.rng() * 0.6;
  return {
    node: w.rng() < 0.5 ? e.a : e.b,
    x: w.city.nx[e.a] + (w.city.nx[e.b] - w.city.nx[e.a]) * f,
    y: w.city.ny[e.a] + (w.city.ny[e.b] - w.city.ny[e.a]) * f,
    street: `${1 + Math.floor(w.rng() * 140)} ${w.city.file.names[e.name] ?? 'rue sans nom'}`,
    edgeName: e.name,
  };
}

export function createCall(w: World, kind: CallKind, spot: Spot, caller = pick(w.rng, kind.callers)): Call {
  const call: Call = {
    id: `c${w.nextId++}`, kind, node: spot.node, x: spot.x, y: spot.y, address: '', street: spot.street,
    caller, at: w.t, deadline: w.t + kind.deadline * 60, priority: kind.priority,
    state: 'nouveau', qualified: false, guessedRight: false, needs: [...kind.needs], assigned: [],
    workLeft: kind.work * 60, escalated: false, outcome: '', firstOnScene: -1, closedAt: 0, earned: 0,
    twistRolled: false, twist: null, decisionLeft: 0, risk: 1, bonus: 1, hold: false, majorId: '', prompt: null,
  };
  const near = landmark(w.city, kind, spot.x, spot.y);
  call.address = near ? `${near}, ${spot.street}` : spot.street;
  if (kind.home) {
    const floor = Math.floor(w.rng() * 7);
    const code = `${1000 + Math.floor(w.rng() * 9000)}${'ABC'[Math.floor(w.rng() * 3)]}`;
    call.address += floor === 0 ? ', rez-de-chaussée' : `, ${floor}${floor === 1 ? 'er' : 'e'} étage, code ${code}`;
  }
  return call;
}
