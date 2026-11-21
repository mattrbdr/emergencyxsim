// Experience and levels: what the player has unlocked.
import { BUILDINGS, BUILDING_ORDER, type BuildingKind } from './catalog/buildings.ts';
import { kindsUnlockedAt } from './catalog/calls.ts';
import { levelFor } from './catalog/levels.ts';
import { UNIT_ORDER, UNITS, type UnitType } from './catalog/units.ts';
import { say } from './log.ts';
import type { World } from './types.ts';

export const unitUnlocked = (w: World, type: UnitType) => UNITS[type].level <= w.level;
export const buildingUnlocked = (w: World, kind: BuildingKind) => BUILDINGS[kind].level <= w.level;

export function gainXp(w: World, amount: number) {
  w.xp += amount;
  const level = levelFor(w.xp);
  if (level > w.level) {
    w.level = level;
    const units = UNIT_ORDER.filter((t) => UNITS[t].level === level).map((t) => UNITS[t].label);
    const buildings = BUILDING_ORDER.filter((k) => BUILDINGS[k].level === level).map((k) => BUILDINGS[k].label);
    const calls = kindsUnlockedAt(level).length;
    say(w, `Niveau ${level} : ${[...buildings, ...units].join(', ')} débloqué${units.length + buildings.length > 1 ? 's' : ''}, ${calls} nouvelles interventions.`, 'good', true);
  }
  w.dirty = true;
}

/** What a level brings, for the unlock card. */
export function unlocksAt(level: number) {
  return {
    units: UNIT_ORDER.filter((t) => UNITS[t].level === level),
    buildings: BUILDING_ORDER.filter((k) => BUILDINGS[k].level === level),
    calls: kindsUnlockedAt(level),
  };
}
