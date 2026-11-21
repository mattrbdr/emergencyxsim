// Experience and levels: what the player has unlocked.
import { BUILDINGS, BUILDING_ORDER, type BuildingKind } from './catalog/buildings.ts';
import { kindsUnlockedAt } from './catalog/calls.ts';
import { levelFor } from './catalog/levels.ts';
import { MAJORS } from './catalog/majors.ts';
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
    const majors = MAJORS.filter((k) => k.level === level).map((k) => k.title.toLowerCase());
    const parts = [
      units.length + buildings.length ? `${[...buildings, ...units].join(', ')} disponible${units.length + buildings.length > 1 ? 's' : ''}` : '',
      calls ? `${calls} nouveau${calls > 1 ? 'x' : ''} motif${calls > 1 ? 's' : ''} d'appel` : '',
      majors.length ? `nouvelle crise possible : ${majors.join(', ')}` : '',
    ].filter(Boolean);
    say(w, `Niveau ${level} · ${parts.join(' · ')}`, 'good', true);
  }
  w.dirty = true;
}

/** What a level brings, for the unlock card. */
export function unlocksAt(level: number) {
  return {
    units: UNIT_ORDER.filter((t) => UNITS[t].level === level),
    buildings: BUILDING_ORDER.filter((k) => BUILDINGS[k].level === level),
    calls: kindsUnlockedAt(level),
    majors: MAJORS.filter((k) => k.level === level),
  };
}
