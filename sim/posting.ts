// Prepositioning: a free vehicle waits at a crossing instead of its base, where
// the next calls are expected (a match ending, schools coming out). It leaves
// from there with no turnout delay, but its crew does not rest.
import { say } from './log.ts';
import { freshTree } from './traffic.ts';
import type { World } from './types.ts';
import { goHome, routeTo } from './units.ts';

/** The next map tap will choose where to station this vehicle. */
export function startPosting(w: World, id: string): boolean {
  const u = w.units.find((x) => x.id === id);
  if (!u || (u.status !== 'dispo' && u.status !== 'poste') || u.flight) return false;
  w.posting = id;
  return true;
}

export function postAt(w: World, node: number): boolean {
  const u = w.units.find((x) => x.id === w.posting);
  w.posting = '';
  if (!u || (u.status !== 'dispo' && u.status !== 'poste')) return false;
  routeTo(u, freshTree(w, node));
  u.status = 'poste';
  u.callId = '';
  say(w, `${u.name} · en poste avancé`, 'info');
  w.dirty = true;
  return true;
}

/** Back to its base. */
export function standDown(w: World, id: string): boolean {
  const u = w.units.find((x) => x.id === id);
  if (!u || u.status !== 'poste') return false;
  goHome(w, u);
  return true;
}
