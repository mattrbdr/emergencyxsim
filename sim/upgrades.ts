// Buying upgrades, and asking whether one applies.
import { BUILDINGS } from './catalog/buildings.ts';
import { UPGRADE, UPGRADES, type UpgradeId } from './catalog/upgrades.ts';
import { spend } from './economy.ts';
import { say } from './log.ts';
import type { Building, Unit, World } from './types.ts';

export const has = (b: Building | undefined, id: UpgradeId) => !!b && b.upgrades.includes(id);
/** The unit's own station has it. */
export const homeHas = (w: World, u: Unit, id: UpgradeId) => has(w.buildings.find((b) => b.id === u.building), id);
/** Any station of the service has it (service-wide upgrades). */
export const anyHas = (w: World, id: UpgradeId) => w.buildings.some((b) => has(b, id));

export const upgradesFor = (b: Building) => UPGRADES.filter((u) => u.kinds.includes(b.kind));

/** Why it cannot be bought now ('' when it can). */
export function cannotUpgrade(w: World, b: Building, id: UpgradeId): string {
  const def = UPGRADE[id];
  if (!def.kinds.includes(b.kind)) return 'Pas ici';
  if (has(b, id)) return 'Installé';
  if (def.level > w.level) return `Niveau ${def.level}`;
  if (w.money < def.price) return 'Fonds insuffisants';
  return '';
}

export function buyUpgrade(w: World, buildingId: string, id: UpgradeId): boolean {
  const b = w.buildings.find((x) => x.id === buildingId);
  if (!b) return false;
  const why = cannotUpgrade(w, b, id);
  if (why !== '' && why !== 'Fonds insuffisants') return false;
  const def = UPGRADE[id];
  if (!spend(w, def.price, `${def.label} à ${b.name}`)) return false;
  b.upgrades.push(id);
  say(w, `${b.name} · ${def.label} en service`, 'good', true);
  return true;
}

/** Garage places, with the heliport's extra two. */
export const maxSlots = (b: Building) => BUILDINGS[b.kind].maxSlots + (has(b, 'heliport') ? 2 : 0);

export const upgradesUpkeep = (b: Building) => b.upgrades.reduce((s, id) => s + (UPGRADE[id as UpgradeId]?.upkeep ?? 0), 0);
