// Simulated players for the engine tests and the balance bench: a careful
// dispatcher, a thrifty manager, a chief who rests and services the fleet.
import { BUILDINGS, KIND_OF_POI } from '../sim/catalog/buildings.ts';
import { UNIT_ORDER, UNITS } from '../sim/catalog/units.ts';
import { buildAt, buySite, buyUnit, expand, unitsOf } from '../sim/buildings.ts';
import { dispatch, options, qualify } from '../sim/calls.ts';
import { decideMajor, majorChoices } from '../sim/majors.ts';
import { choices, decide } from '../sim/scenes.ts';
import { coverageShare, withStationAt } from '../sim/coverage.ts';
import type { World } from '../sim/types.ts';

/** A careful dispatcher: qualifies right, sends the suggestion. */
export function regulate(w: World) {
  for (const c of w.calls) {
    if (c.state === 'clos') continue;
    if (c.state === 'bilan' && c.prompt) {
      // A crisis: the option most likely to succeed among those the fleet allows.
      const open = majorChoices(w, c).filter((o) => o.enabled).map((o) => o.id);
      const pick = c.prompt.options.filter((o) => open.includes(o.id)).sort((a, b) => b.success - a.success)[0];
      if (pick) decideMajor(w, c, pick.id);
      continue;
    }
    if (c.state === 'bilan') {
      const best = choices(w, c).find((o) => o.enabled && o.id === 'renfort') ?? choices(w, c).find((o) => o.id === 'evacuer') ?? choices(w, c)[1];
      decide(w, c, best.id);
    }
    if (!c.qualified) qualify(w, c.id, c.kind.family);
    const picks = options(w, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
    if (picks.length) dispatch(w, c.id, picks);
  }
}

/** A careful chief: rests a tired crew when another of its kind is free, services worn vehicles. */
export async function care(w: World, upgrade = false) {
  const { rest, service } = await import('../sim/crews.ts');
  if (upgrade) {
    const { upgradesFor, cannotUpgrade, buyUpgrade } = await import('../sim/upgrades.ts');
    // Spends what is above a 50 000 € reserve on the cheapest upgrade available.
    const offers = w.buildings.flatMap((b) => upgradesFor(b).filter((u) => cannotUpgrade(w, b, u.id) === '').map((u) => ({ b, u })));
    const best = offers.sort((a, b) => a.u.price - b.u.price)[0];
    if (best && w.money - best.u.price > 50000) buyUpgrade(w, best.b.id, best.u.id);
  }
  for (const u of w.units) {
    if (u.status !== 'dispo') continue;
    const spare = w.units.some((x) => x !== u && x.type === u.type && x.status === 'dispo' && x.fatigue < 50);
    if (u.fatigue > 70 && spare) rest(w, u.id);
    else if (u.wear > 50 && w.money > 15000) service(w, u.id);
  }
}

/** A thrifty manager: keeps 10 000 € aside, buys sites then the rarest unlocked vehicle. */
export function manage(w: World) {
  const reserve = 10000;
  // Like a real chief: a new caserne where the town is worst covered, once affordable.
  if (coverageShare(w) < 0.75 && w.money > BUILDINGS.caserne.build + 30000 && w.buildings.filter((b) => b.kind === 'caserne').length < 4) {
    let best = -1, gain = 0;
    for (let i = 0; i < 30; i++) {
      const node = w.city.callEdges[Math.floor(w.rng() * w.city.callEdges.length)];
      const g = withStationAt(w, w.city.edges[node].a).gain;
      if (g > gain) { gain = g; best = w.city.edges[node].a; }
    }
    if (best >= 0 && gain > 0.05) {
      const b = buildAt(w, 'caserne', w.city.nx[best], w.city.ny[best]);
      if (b) buyUnit(w, b.id, 'VSAV');
    }
  }
  for (const kind of ['police', 'hopital'] as const) {
    if (BUILDINGS[kind].level <= w.level && !w.buildings.some((b) => b.kind === kind)) {
      const site = w.city.pois.findIndex((p) => KIND_OF_POI[p.kind] === kind);
      if (site >= 0 && w.money > BUILDINGS[kind].buy + reserve) buySite(w, site);
    }
  }
  const unlocked = UNIT_ORDER.filter((t) => UNITS[t].level <= w.level && t !== 'HELI' && w.buildings.some((b) => b.kind === UNITS[t].building));
  const counts = (t: string) => w.units.filter((u) => u.type === t).length;
  const next = unlocked.sort((a, b) => counts(a) - counts(b))[0];
  if (!next) return;
  const home = w.buildings.find((b) => b.kind === UNITS[next].building);
  if (!home || w.money < UNITS[next].price + reserve) return;
  if (unitsOf(w, home).length >= home.slots && !expand(w, home.id)) {
    // Garage at its maximum: open another caserne / post across town.
    const kind = home.kind;
    const site = w.city.pois.findIndex((p, i) => KIND_OF_POI[p.kind] === kind && !w.buildings.some((b) => b.site === i));
    const added = site >= 0 ? buySite(w, site) : buildAt(w, kind, w.rng() * w.city.width, w.rng() * w.city.height);
    if (added) buyUnit(w, added.id, next);
    return;
  }
  buyUnit(w, home.id, next);
}
