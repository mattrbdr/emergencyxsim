// Building and buying stations, extending garages, buying and selling vehicles.
import { BUILDINGS, KIND_OF_POI, type BuildingKind } from './catalog/buildings.ts';
import { UNITS, type UnitType } from './catalog/units.ts';
import { nearestNode } from './city.ts';
import { spend } from './economy.ts';
import { euros, say } from './log.ts';
import { buildingUnlocked, unitUnlocked } from './progression.ts';
import type { Building, Unit, World } from './types.ts';

const streetAt = (w: World, node: number) => {
  const e = w.city.adj[node][0];
  return e === undefined ? '' : w.city.file.names[w.city.edges[e].name] ?? '';
};

const siteTaken = (w: World, site: number) => w.buildings.some((b) => b.site === site);

/** The player's first caserne is free and comes with a VSAV. */
export const isFirstBuilding = (w: World) => w.buildings.length === 0;

export function buildPrice(w: World, kind: BuildingKind) {
  return isFirstBuilding(w) && kind === 'caserne' ? 0 : BUILDINGS[kind].build;
}
export function sitePrice(w: World, kind: BuildingKind) {
  return isFirstBuilding(w) && kind === 'caserne' ? 0 : BUILDINGS[kind].buy;
}

function add(w: World, kind: BuildingKind, node: number, name: string, site: number): Building {
  const b: Building = {
    id: `b${w.nextId++}`, kind, name, node, x: w.city.nx[node], y: w.city.ny[node],
    slots: BUILDINGS[kind].slots, site, patients: 0,
  };
  const first = isFirstBuilding(w);
  w.buildings.push(b);
  w.dirty = true;
  say(w, `${name} est opérationnel${kind === 'caserne' ? 'le' : ''}.`, 'good', true);
  if (first) addUnit(w, b, 'VSAV');
  return b;
}

/** Build on the road node closest to a map point. */
export function buildAt(w: World, kind: BuildingKind, x: number, y: number): Building | null {
  if (!buildingUnlocked(w, kind)) return null;
  const node = nearestNode(w.city, x, y);
  if (w.buildings.some((b) => Math.hypot(b.x - w.city.nx[node], b.y - w.city.ny[node]) < 120)) {
    say(w, 'Trop près d\'un bâtiment existant.', 'bad', true);
    return null;
  }
  const price = buildPrice(w, kind);
  if (!spend(w, price, `construire ${BUILDINGS[kind].label.toLowerCase()}`)) return null;
  const street = streetAt(w, node);
  const count = w.buildings.filter((b) => b.kind === kind).length + 1;
  return add(w, kind, node, `${BUILDINGS[kind].label} ${street || count}`, -1);
}

/** Take over a real station from the map (cheaper than building). */
export function buySite(w: World, site: number): Building | null {
  const poi = w.city.pois[site];
  if (!poi || siteTaken(w, site)) return null;
  const kind = KIND_OF_POI[poi.kind];
  if (!buildingUnlocked(w, kind)) {
    say(w, `${BUILDINGS[kind].label} : débloqué au niveau ${BUILDINGS[kind].level}.`, 'bad', true);
    return null;
  }
  if (!spend(w, sitePrice(w, kind), `racheter ${poi.name}`)) return null;
  return add(w, kind, poi.node, poi.name, site);
}

export function expand(w: World, buildingId: string): boolean {
  const b = w.buildings.find((x) => x.id === buildingId);
  if (!b) return false;
  const def = BUILDINGS[b.kind];
  if (b.slots >= def.maxSlots) return false;
  if (!spend(w, def.expand, `agrandir ${b.name}`)) return false;
  b.slots += 2;
  say(w, `${b.name} agrandi : ${b.slots} places de garage.`, 'info');
  return true;
}

export const unitsOf = (w: World, b: Building) => w.units.filter((u) => u.building === b.id);

function addUnit(w: World, b: Building, type: UnitType): Unit {
  const n = w.units.filter((u) => u.type === type).length + 1;
  const u: Unit = {
    id: `u${w.nextId++}`, type, service: UNITS[type].service, name: `${UNITS[type].label} ${n}`,
    building: b.id, home: b.node, path: [b.node], along: 0, flight: null,
    x: b.x, y: b.y, px: b.x, py: b.y, heading: 0, status: 'dispo', callId: '', wait: 0, missions: 0,
  };
  w.units.push(u);
  w.dirty = true;
  return u;
}

/** Why a vehicle cannot be bought here ('' when it can). */
export function cannotBuy(w: World, b: Building, type: UnitType): string {
  const def = UNITS[type];
  if (def.building !== b.kind) return `Se gare dans : ${BUILDINGS[def.building].label.toLowerCase()}`;
  if (!unitUnlocked(w, type)) return `Niveau ${def.level}`;
  if (unitsOf(w, b).length >= b.slots) return 'Garage plein';
  if (w.money < def.price) return 'Fonds insuffisants';
  return '';
}

export function buyUnit(w: World, buildingId: string, type: UnitType): Unit | null {
  const b = w.buildings.find((x) => x.id === buildingId);
  if (!b) return null;
  const why = cannotBuy(w, b, type);
  if (why) { say(w, `${UNITS[type].label} : ${why.toLowerCase()}.`, 'bad', true); return null; }
  if (!spend(w, UNITS[type].price, UNITS[type].label)) return null;
  const u = addUnit(w, b, type);
  say(w, `${u.name} rejoint ${b.name} (−${euros(UNITS[type].price)}).`, 'money');
  return u;
}

/** Sold vehicles fetch half their price; only a vehicle at home can be sold. */
export function sellUnit(w: World, unitId: string): boolean {
  const u = w.units.find((x) => x.id === unitId);
  if (!u || u.status !== 'dispo') return false;
  const refund = Math.round(UNITS[u.type].price / 2);
  w.units = w.units.filter((x) => x !== u);
  w.money += refund;
  w.dirty = true;
  say(w, `${u.name} vendu (+${euros(refund)}).`, 'money');
  return true;
}
