// Money and reputation: rewards for interventions, hourly upkeep, purchases.
import { BUILDINGS } from './catalog/buildings.ts';
import type { CallKind } from './catalog/calls.ts';
import { UNITS } from './catalog/units.ts';
import { euros, say } from './log.ts';
import type { World } from './types.ts';

/** Reputation 0–100 scales rewards from ×0.75 to ×1.25. */
export const reputationFactor = (w: World) => 0.75 + (w.reputation / 100) * 0.5;

export function reward(w: World, kind: CallKind, secondsEarly: number): number {
  const speedBonus = 1 + Math.min(0.3, Math.max(0, secondsEarly / 60) * 0.02);
  return Math.round((kind.reward * speedBonus * reputationFactor(w)) / 10) * 10;
}

export function earn(w: World, amount: number) {
  w.money += amount;
  w.stats.earned += amount;
  w.dayStats.earned += amount;
  w.dirty = true;
}

/** Spends if the player can afford it; says why not otherwise. */
export function spend(w: World, amount: number, what: string): boolean {
  if (w.money < amount) {
    say(w, `Fonds insuffisants pour ${what} : ${euros(amount)}`, 'bad', true);
    return false;
  }
  w.money -= amount;
  w.stats.spent += amount;
  w.dirty = true;
  return true;
}

export function adjustReputation(w: World, delta: number) {
  w.reputation = Math.max(0, Math.min(100, w.reputation + delta));
}

/** Euros per game hour for the whole service. */
export function upkeepPerHour(w: World): number {
  const units = w.units.reduce((s, u) => s + UNITS[u.type].upkeep, 0);
  const buildings = w.buildings.reduce((s, b) => s + BUILDINGS[b.kind].upkeep + (b.slots - BUILDINGS[b.kind].slots) * 10, 0);
  return units + buildings;
}

/** Charged once per game hour. */
export function chargeUpkeep(w: World, before: number) {
  if (Math.floor(before / 3600) === Math.floor(w.t / 3600)) return;
  const cost = upkeepPerHour(w);
  if (cost <= 0) return;
  w.money -= cost;
  w.stats.spent += cost;
  w.dirty = true;
  say(w, `Entretien des moyens · −${euros(cost)}`, 'money');
}
