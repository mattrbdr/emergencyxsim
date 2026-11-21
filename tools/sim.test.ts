// Engine tests, hostless: bun test tools/
import { expect, test } from 'bun:test';
import cityFile from '../data/city.json';
import { BUILDINGS, KIND_OF_POI } from '../sim/catalog/buildings.ts';
import { CALL_KINDS } from '../sim/catalog/calls.ts';
import { START_MONEY } from '../sim/catalog/levels.ts';
import { UNIT_ORDER, UNITS } from '../sim/catalog/units.ts';
import { loadCity, type CityFile } from '../sim/city.ts';
import { buildAt, buySite, buyUnit, expand, unitsOf } from '../sim/buildings.ts';
import { dispatch, options, qualify } from '../sim/calls.ts';
import { pathTo, search } from '../sim/routing.ts';
import type { World } from '../sim/types.ts';
import { newWorld, tick } from '../sim/world.ts';

const city = loadCity(cityFile as unknown as CityFile);
const centre = { x: city.width / 2, y: city.height / 2 };

/** A careful dispatcher: qualifies right, sends the suggestion. */
function regulate(w: World) {
  for (const c of w.calls) {
    if (c.state === 'clos') continue;
    if (!c.qualified) qualify(w, c.id, c.kind.family);
    const picks = options(w, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
    if (picks.length) dispatch(w, c.id, picks);
  }
}

/** A thrifty manager: keeps 10 000 € aside, buys sites then the rarest unlocked vehicle. */
function manage(w: World) {
  const reserve = 10000;
  for (const kind of ['police', 'hopital'] as const) {
    if (BUILDINGS[kind].level <= w.level && !w.buildings.some((b) => b.kind === kind)) {
      const site = city.pois.findIndex((p) => KIND_OF_POI[p.kind] === kind);
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
    const site = city.pois.findIndex((p, i) => KIND_OF_POI[p.kind] === kind && !w.buildings.some((b) => b.site === i));
    const added = site >= 0 ? buySite(w, site) : buildAt(w, kind, w.rng() * city.width, w.rng() * city.height);
    if (added) buyUnit(w, added.id, next);
    return;
  }
  buyUnit(w, home.id, next);
}

test('every station reaches every other one by road', () => {
  const tree = search(city, city.pois[0].node);
  for (const p of city.pois) {
    expect(Number.isFinite(tree.time[p.node])).toBe(true);
    expect(pathTo(tree, p.node).at(-1)).toBe(city.pois[0].node);
  }
});

test('the catalogue: every level unlocks something, every call is reachable', () => {
  for (let level = 1; level <= 12; level++) {
    expect(UNIT_ORDER.some((t) => UNITS[t].level === level)).toBe(true);
    expect(CALL_KINDS.some((k) => k.level === level)).toBe(true);
  }
  expect(CALL_KINDS.length).toBeGreaterThanOrEqual(30);
  expect(CALL_KINDS.filter((k) => k.level === 1).every((k) => k.needs.every((t) => t === 'VSAV'))).toBe(true);
});

test('a career starts with money, a free caserne and one VSAV', () => {
  const w = newWorld(city, 3);
  expect(w.money).toBe(START_MONEY);
  tick(w, 60000);
  expect(w.calls.length).toBe(0); // nothing happens before the first station
  const b = buildAt(w, 'caserne', centre.x, centre.y)!;
  expect(b).not.toBeNull();
  expect(w.money).toBe(START_MONEY);
  expect(w.units.map((u) => u.type)).toEqual(['VSAV']);
  expect(buildAt(w, 'police', centre.x + 800, centre.y)).toBeNull(); // level 3
  expect(buyUnit(w, b.id, 'FPT')).toBeNull(); // level 2
});

test('money is checked before any purchase', () => {
  const w = newWorld(city, 3);
  const b = buildAt(w, 'caserne', centre.x, centre.y)!;
  w.money = 1000;
  expect(buyUnit(w, b.id, 'VSAV')).toBeNull();
  expect(w.units.length).toBe(1);
  w.money = 100000;
  expect(buyUnit(w, b.id, 'VSAV')).not.toBeNull();
  expect(buyUnit(w, b.id, 'VSAV')).toBeNull(); // 2 slots
  expect(expand(w, b.id)).toBe(true);
  expect(buyUnit(w, b.id, 'VSAV')).not.toBeNull();
});

test('level 1 only brings calls a VSAV can handle; a call pays money and XP', () => {
  const w = newWorld(city, 11);
  buildAt(w, 'caserne', centre.x, centre.y);
  let paid = false;
  for (let i = 0; i < 4 * 60 * 30 && !paid; i++) {
    tick(w, 250);
    regulate(w);
    paid = w.calls.some((c) => c.outcome === 'sauve');
  }
  expect(paid).toBe(true);
  expect(w.calls.every((c) => c.kind.level === 1)).toBe(true);
  expect(w.xp).toBeGreaterThan(0);
  expect(w.stats.earned).toBeGreaterThan(0);
});

test('a managed career levels up over three game days and stays solvent', () => {
  const w = newWorld(city, 42);
  buildAt(w, 'caserne', centre.x, centre.y);
  w.speed = 4;
  const days = 3 * 86400;
  let lowest = w.money;
  while (w.t < days) {
    tick(w, 250);
    regulate(w);
    if (Math.floor(w.t) % 600 < 60) manage(w);
    lowest = Math.min(lowest, w.money);
  }
  const s = w.stats;
  console.log(`career: level ${w.level}, xp ${w.xp}, money ${Math.round(w.money)}, lowest ${Math.round(lowest)}, rep ${w.reputation}, units ${w.units.length} (${[...new Set(w.units.map((u) => u.type))].join(',')}), calls ${s.calls}, saved ${s.saved}, lost ${s.lost}, failed ${s.failed}`);
  expect(w.level).toBeGreaterThanOrEqual(5);
  expect(lowest).toBeGreaterThan(-5000);
  expect(s.saved).toBeGreaterThan(s.lost * 3);
});

test('the same seed replays the same career', () => {
  const run = () => {
    const w = newWorld(city, 99);
    buildAt(w, 'caserne', centre.x, centre.y);
    for (let i = 0; i < 3000; i++) tick(w, 250);
    return w.calls.map((c) => `${c.kind.id}@${c.address}`).join('|');
  };
  expect(run()).toBe(run());
});
