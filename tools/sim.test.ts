// Engine tests, hostless: bun test tools/
import { expect, test } from 'bun:test';
import cityFile from '../data/city.json';
import { BUILDINGS, KIND_OF_POI } from '../sim/catalog/buildings.ts';
import { CALL_KINDS } from '../sim/catalog/calls.ts';
import { START_MONEY } from '../sim/catalog/levels.ts';
import { UNIT_ORDER, UNITS } from '../sim/catalog/units.ts';
import { loadCity, nearestNode, type CityFile } from '../sim/city.ts';
import { buildAt, buySite, buyUnit, expand, unitsOf } from '../sim/buildings.ts';
import { dispatch, options, qualify } from '../sim/calls.ts';
import { pathTo, search } from '../sim/routing.ts';
import { choices, decide } from '../sim/scenes.ts';
import type { World } from '../sim/types.ts';
import { newWorld, tick } from '../sim/world.ts';

const city = loadCity(cityFile as unknown as CityFile);
const centre = { x: city.width / 2, y: city.height / 2 };

/** A careful dispatcher: qualifies right, sends the suggestion. */
function regulate(w: World) {
  for (const c of w.calls) {
    if (c.state === 'clos') continue;
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
async function care(w: World, upgrade = false) {
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
  const { MAJORS } = require('../sim/catalog/majors.ts');
  const { XP_FOR_LEVEL, MAX_LEVEL } = require('../sim/catalog/levels.ts');
  expect(MAX_LEVEL).toBe(25);
  for (let i = 1; i < XP_FOR_LEVEL.length; i++) expect(XP_FOR_LEVEL[i]).toBeGreaterThan(XP_FOR_LEVEL[i - 1]);
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const unlocks = UNIT_ORDER.some((t) => UNITS[t].level === level) || MAJORS.some((k: { level: number }) => k.level === level);
    expect(unlocks ? 'ok' : `level ${level} unlocks nothing`).toBe('ok');
    if (level <= 20) expect(CALL_KINDS.some((k) => k.level === level)).toBe(true);
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

test('a managed career levels up over three game days and stays solvent', async () => {
  const w = newWorld(city, 42);
  buildAt(w, 'caserne', centre.x, centre.y);
  w.speed = 4;
  const days = 3 * 86400;
  let lowest = w.money;
  while (w.t < days) {
    tick(w, 250);
    regulate(w);
    if (Math.floor(w.t) % 600 < 60) { manage(w); await care(w); }
    lowest = Math.min(lowest, w.money);
  }
  const s = w.stats;
  console.log(`career: level ${w.level}, xp ${w.xp}, money ${Math.round(w.money)}, lowest ${Math.round(lowest)}, rep ${w.reputation}, units ${w.units.length} (${[...new Set(w.units.map((u) => u.type))].join(',')}), calls ${s.calls}, saved ${s.saved}, lost ${s.lost}, failed ${s.failed}`);
  expect(w.level).toBeGreaterThanOrEqual(5);
  expect(lowest).toBeGreaterThan(-5000);
  expect(s.saved).toBeGreaterThan(s.lost * 2.5);
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

test('a twist on scene asks a decision; reinforcements add needs and a bonus', () => {
  const w = newWorld(city, 5);
  buildAt(w, 'caserne', centre.x, centre.y);
  w.money = 1e6;
  const b = w.buildings[0];
  expand(w, b.id);
  buyUnit(w, b.id, 'VSAV');
  let seen = 0, reinforced = 0;
  for (let i = 0; i < 4 * 60 * 120 && reinforced < 2; i++) {
    tick(w, 250);
    for (const c of w.calls) {
      if (c.state === 'bilan') {
        seen++;
        const before = c.needs.length;
        const renfort = choices(w, c).find((o) => o.id === 'renfort')!;
        // Level-1 twists ask for a VSAV; one is spare unless both are busy.
        if (!renfort.enabled) { decide(w, c, 'surplace'); continue; }
        expect(decide(w, c, 'renfort')).toBe(true);
        expect(c.needs.length).toBe(before + 1);
        expect(c.bonus).toBe(1.3);
        reinforced++;
      }
    }
    regulate(w);
  }
  expect(seen).toBeGreaterThan(0);
});

test('making do is risky: about 60 % succeed', () => {
  let ok = 0, n = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const w = newWorld(city, seed);
    buildAt(w, 'caserne', centre.x, centre.y);
    for (let i = 0; i < 4 * 60 * 60 && n < 200; i++) {
      tick(w, 250);
      for (const c of w.calls) if (c.state === 'bilan') decide(w, c, 'surplace');
      regulate(w);
    }
    for (const c of w.calls) if (c.risk < 1 && c.state === 'clos') { n++; if (c.outcome === 'sauve') ok++; }
  }
  expect(n).toBeGreaterThan(10);
  expect(ok / n).toBeGreaterThan(0.35);
  expect(ok / n).toBeLessThan(0.85);
});

test('coverage: a central station covers most streets, a second one adds to it', async () => {
  const { coverageShare, withStationAt } = await import('../sim/coverage.ts');
  const { nearestNode } = await import('../sim/city.ts');
  const w = newWorld(city, 1);
  expect(coverageShare(w)).toBe(0);
  buildAt(w, 'caserne', centre.x, centre.y);
  const one = coverageShare(w);
  expect(one).toBeGreaterThan(0.4);
  expect(one).toBeLessThan(0.95);
  const corner = withStationAt(w, nearestNode(city, city.width * 0.9, city.height * 0.9));
  expect(corner.gain).toBeGreaterThan(0.03);
  const twin = withStationAt(w, nearestNode(city, centre.x + 50, centre.y));
  expect(twin.gain).toBeLessThan(corner.gain);
});

test('districts draw their calls: falls near nursing homes, fires in the industrial zone', async () => {
  const { CALL_KINDS } = await import('../sim/catalog/calls.ts');
  const { pickStreet, placesAt } = await import('../sim/places.ts');
  const { mulberry } = await import('../sim/rng.ts');
  const rng = mulberry(7);
  const share = (id: string, place: string) => {
    const kind = CALL_KINDS.find((k) => k.id === id)!;
    let hit = 0;
    for (let i = 0; i < 400; i++) if (placesAt(city, pickStreet(city, kind, rng, {}, () => false)).has(place as never)) hit++;
    return hit / 400;
  };
  const base = (place: string) => share('malaise_domicile', place);
  expect(share('chute', 'ehpad')).toBeGreaterThan(base('ehpad') * 2);
  expect(share('feu_entrepot', 'industriel')).toBeGreaterThan(base('industriel') * 2);
  expect(share('tapage', 'bar')).toBeGreaterThan(base('bar') * 2);
});

test('daily contracts: three a day, paid once, renewed at 07:00, a perfect day starts a streak', () => {
  const w = newWorld(city, 21);
  buildAt(w, 'caserne', centre.x, centre.y);
  tick(w, 250);
  expect(w.contracts.length).toBe(3);
  expect(new Set(w.contracts.map((c) => c.kind)).size).toBe(3);
  // Force-complete the day's contracts.
  const money = w.money;
  for (const c of w.contracts) { c.target = 0; }
  tick(w, 250);
  expect(w.contracts.every((c) => c.state === 'done')).toBe(true);
  expect(w.money).toBeGreaterThan(money);
  const paid = w.money;
  tick(w, 250);
  expect(w.money).toBeLessThanOrEqual(paid); // not paid twice
  w.speed = 4;
  const day = w.dayStats.day;
  while (w.dayStats.day === day) tick(w, 1000);
  expect(w.streak).toBe(1);
  expect(w.contracts.every((c) => c.state === 'open' || c.state === 'done')).toBe(true);
});

test('the tutorial follows the player and then gives tips once', async () => {
  const { STEPS, guide, dismissTip } = await import('../sim/tutorial.ts');
  const w = newWorld(city, 4);
  tick(w, 250);
  expect(guide(w).hint).toBe('open-build');
  buildAt(w, 'caserne', centre.x, centre.y);
  for (let i = 0; i < 4 * 60 * 40 && w.tutorial < STEPS.length; i++) {
    tick(w, 250);
    regulate(w);
    if (w.tutorial === STEPS.length - 1) { w.money = 1e6; buyUnit(w, w.buildings[0].id, 'VSAV'); }
  }
  expect(w.tutorial).toBe(STEPS.length);
  for (let i = 0; i < 20 && w.tip === ''; i++) tick(w, 250);
  expect(w.tip).toBe('contracts');
  dismissTip(w);
  tick(w, 250);
  expect(w.tipsSeen).toContain('contracts');
  expect(w.tip).not.toBe('contracts');
});

test('reinforcements need a spare vehicle: the only VSAV on scene cannot reinforce itself', async () => {
  const { choices } = await import('../sim/scenes.ts');
  const w = newWorld(city, 31);
  buildAt(w, 'caserne', centre.x, centre.y);
  while (w.calls.length === 0) tick(w, 250);
  const c = w.calls[0];
  c.twist = { id: 't', report: 'r', add: ['VSAV'], from: 'VSAV 1' };
  c.state = 'bilan';
  w.units[0].callId = c.id;
  expect(choices(w, c).find((o) => o.id === 'renfort')!.enabled).toBe(false);
});

async function policeCity(seed: number) {
  const w = newWorld(city, seed);
  w.level = 10;
  w.money = 1e7;
  const b = buildAt(w, 'caserne', centre.x, centre.y)!;
  expand(w, b.id);
  buyUnit(w, b.id, 'VSAV');
  const site = city.pois.findIndex((p) => p.kind === 'police');
  const post = buySite(w, site)!;
  expand(w, post.id);
  expand(w, post.id);
  for (const t of ['PS', 'PS', 'BAC', 'BAC', 'BRI'] as const) buyUnit(w, post.id, t);
  w.nextCallAt = Infinity; // only the incident
  return w;
}

test('hostage robbery: perimeter, the BRI assault, hostages to hospital, then a big reward', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor, decideMajor } = await import('../sim/majors.ts');
  const w = await policeCity(8);
  const money = w.money;
  const m = startMajor(w, MAJORS.find((k) => k.id === 'otages')!);
  const phases: number[] = [];
  for (let i = 0; i < 4 * 60 * 60 && m.state === 'actif'; i++) {
    tick(w, 250);
    if (phases.at(-1) !== m.phase) phases.push(m.phase);
    for (const c of w.calls) {
      if (c.state === 'bilan' && c.prompt) decideMajor(w, c, 'bri');
      else if (c.state !== 'clos') {
        const picks = options(w, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
        if (picks.length) dispatch(w, c.id, picks);
      }
    }
  }
  expect(phases).toEqual([0, 1, 2]);
  expect(['reussi', 'echec']).toContain(m.state);
  expect(w.majorReport?.title).toBe('Braquage avec prise d\'otages');
  if (m.state === 'reussi') expect(w.money).toBeGreaterThan(money + 5000);
});

test('hostage robbery: no perimeter in time and the operation fails', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor } = await import('../sim/majors.ts');
  const w = await policeCity(9);
  const rep = w.reputation;
  const m = startMajor(w, MAJORS[0]);
  for (let i = 0; i < 4 * 60 * 10 && m.state === 'actif'; i++) tick(w, 250);
  expect(m.state).toBe('echec');
  expect(w.reputation).toBeLessThan(rep);
});

test('a major incident arrives on its own once unlocked', async () => {
  const w = await policeCity(10);
  w.nextCallAt = 0;
  w.speed = 4;
  while (w.majors.length === 0 && w.t < 4 * 86400) tick(w, 1000);
  expect(w.majors.length).toBe(1);
});

test('every major incident runs through all its phases with a full fleet', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor, decideMajor, majorChoices } = await import('../sim/majors.ts');
  for (const kind of MAJORS) {
    const w = fullFleet(77);
    const m = startMajor(w, kind);
    let lastPhase = 0;
    for (let i = 0; i < 4 * 60 * 120 && m.state === 'actif'; i++) {
      tick(w, 250);
      lastPhase = Math.max(lastPhase, m.phase);
      for (const c of w.calls) {
        if (c.state === 'clos') continue;
        if (c.state === 'bilan' && c.prompt) {
          const best = [...c.prompt.options].filter((o) => majorChoices(w, c).find((x) => x.id === o.id)?.enabled).sort((a, b) => b.success - a.success)[0];
          decideMajor(w, c, best.id);
        } else {
          const picks = options(w, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
          if (picks.length) dispatch(w, c.id, picks);
        }
      }
    }
    expect(m.state === 'actif' ? `${kind.id} stuck in phase ${m.phase}` : 'ended').toBe('ended');
    expect(lastPhase === kind.phases.length - 1 || m.state === 'echec').toBe(true);
  }
});

/** Level 12, every kind of vehicle, no ordinary calls. */
function fullFleet(seed: number) {
  const w = newWorld(city, seed);
  w.level = 25;
  w.money = 1e8;
  const fire1 = buildAt(w, 'caserne', centre.x, centre.y)!;
  const fire2 = buildAt(w, 'caserne', centre.x + 900, centre.y + 400)!;
  const fire3 = buildAt(w, 'caserne', centre.x - 900, centre.y - 400)!;
  const post = buySite(w, city.pois.findIndex((p) => p.kind === 'police'))!;
  const post2 = buildAt(w, 'police', centre.x + 400, centre.y - 600)!;
  const hosp = buySite(w, city.pois.findIndex((p) => p.kind === 'hospital'))!;
  for (const b of [fire1, fire2, fire3, post, post2, hosp]) for (let i = 0; i < 3; i++) expand(w, b.id);
  for (const t of ['FMOGP', 'VSN', 'VSN', 'DRONE', 'GRIMP'] as const) buyUnit(w, fire3.id, t);
  for (const t of ['RAID', 'CYNO', 'MOTO'] as const) buyUnit(w, post2.id, t);
  buyUnit(w, hosp.id, 'HELI');
  for (const t of ['FPT', 'FPT', 'EPA', 'VSAV', 'VSAV', 'VSAV', 'VTU', 'VTU'] as const) buyUnit(w, fire1.id, t);
  for (const t of ['FPTGP', 'VPC', 'CMIC', 'VSR', 'VPMA', 'FPT'] as const) buyUnit(w, fire2.id, t);
  for (const t of ['PS', 'PS', 'PS', 'BAC', 'BAC', 'BRI'] as const) buyUnit(w, post.id, t);
  for (const t of ['SMUR', 'AMB', 'AMB'] as const) buyUnit(w, hosp.id, t);
  w.nextCallAt = Infinity;
  return w;
}

test('flash flood: side streets are cut, routes go round them, they reopen at the end', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor } = await import('../sim/majors.ts');
  const { freshTree } = await import('../sim/traffic.ts');
  const w = fullFleet(5);
  const m = startMajor(w, MAJORS.find((k) => k.id === 'inondation_eclair')!);
  expect(w.blocked.size).toBeGreaterThan(3);
  for (const i of w.blocked) expect(city.edges[i].cls).toBeGreaterThan(1);
  // A route from the site to the far corner never uses a flooded street when another way exists.
  const tree = freshTree(w, m.spot.node);
  const far = nearestNode(city, 0, 0);
  const way = pathTo(tree, far);
  let flooded = 0;
  for (let i = 1; i < way.length; i++) {
    const e = city.adj[way[i]].find((x) => city.edges[x].a === way[i - 1] || city.edges[x].b === way[i - 1]);
    if (e !== undefined && w.blocked.has(e)) flooded++;
  }
  expect(flooded).toBeLessThanOrEqual(1);
  for (let i = 0; i < 4 * 60 * 180 && m.state === 'actif'; i++) tick(w, 250);
  expect(m.state).not.toBe('actif');
  expect(w.blocked.size).toBe(0);
});

test('factory fire: the plume follows a wind direction', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor } = await import('../sim/majors.ts');
  const w = fullFleet(6);
  const m = startMajor(w, MAJORS.find((k) => k.effect === 'plume')!);
  expect(m.wind).toBeGreaterThanOrEqual(0);
  expect(m.wind).toBeLessThan(Math.PI * 2);
});

test('pursuit: the vehicle drives away, two crews box it in, the call follows it', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor } = await import('../sim/majors.ts');
  const w = fullFleet(7);
  const m = startMajor(w, MAJORS.find((k) => k.id === 'poursuite')!);
  const start = { x: m.fugitive!.x, y: m.fugitive!.y };
  const call = w.calls.find((c) => c.id === m.callId)!;
  expect(call.hold).toBe(true);
  let travelled = 0;
  for (let i = 0; i < 40; i++) {
    tick(w, 250);
    travelled += Math.hypot(m.fugitive!.x - m.fugitive!.px, m.fugitive!.y - m.fugitive!.py);
  }
  expect(travelled).toBeGreaterThan(100);
  expect(Math.hypot(m.fugitive!.x - start.x, m.fugitive!.y - start.y)).toBeGreaterThan(0);
  expect(call.x).toBeCloseTo(m.fugitive!.x, 5);
  for (let i = 0; i < 4 * 60 * 60 && !m.fugitive!.stopped && m.state === 'actif'; i++) {
    tick(w, 250);
    for (const c of w.calls) {
      if (c.state === 'clos' || c.assigned.length) continue;
      const picks = options(w, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
      if (picks.length) dispatch(w, c.id, picks);
    }
  }
  expect(m.fugitive!.stopped).toBe(true);
  expect(call.hold).toBe(false);
});

test('a reload during a crisis keeps it: same phase, same streets cut, its call waits for crews', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor } = await import('../sim/majors.ts');
  const { snapshotSave } = await import('../src/persistence.ts');
  const { restore } = await import('../src/game.ts');
  const w = fullFleet(8);
  const m = startMajor(w, MAJORS.find((k) => k.id === 'inondation_eclair')!);
  const call = w.calls.find((c) => c.id === m.callId)!;
  const picks = options(w, call.id).filter((o) => o.suggested).map((o) => o.unit.id);
  dispatch(w, call.id, picks);
  for (let i = 0; i < 40; i++) tick(w, 250);
  const back = restore(city, JSON.parse(JSON.stringify(snapshotSave(w))));
  const m2 = back.majors[0];
  expect(m2?.state).toBe('actif');
  expect(m2.kind.id).toBe('inondation_eclair');
  expect(m2.phase).toBe(m.phase);
  expect(back.blocked.size).toBe(w.blocked.size);
  const c2 = back.calls.find((c) => c.id === m2.callId)!;
  expect(c2.assigned).toEqual([]);
  expect(c2.state).toBe('attente');
  expect(back.units.every((u) => u.status === 'dispo')).toBe(true);
  // Sent again, the crews finish the job.
  for (let i = 0; i < 4 * 60 * 180 && m2.state === 'actif'; i++) {
    tick(back, 250);
    for (const c of back.calls) {
      if (c.state === 'clos' || c.assigned.length) continue;
      const ids = options(back, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
      if (ids.length) dispatch(back, c.id, ids);
    }
  }
  expect(m2.state).not.toBe('actif');
  expect(back.blocked.size).toBe(0);
});

test('five days at level 12 with a medium fleet: crises come, end, and the service stays solvent', async () => {
  const { decideMajor, majorChoices } = await import('../sim/majors.ts');
  const w = newWorld(city, 12);
  w.level = 12;
  w.seenLevel = 12;
  w.money = 2e6;
  const fire = buildAt(w, 'caserne', centre.x, centre.y)!;
  const post = buySite(w, city.pois.findIndex((p) => p.kind === 'police'))!;
  const hosp = buySite(w, city.pois.findIndex((p) => p.kind === 'hospital'))!;
  for (const b of [fire, post, hosp]) for (let i = 0; i < 2; i++) expand(w, b.id);
  for (const t of ['FPT', 'FPT', 'EPA', 'VSAV', 'VSAV', 'VTU', 'VPC', 'CMIC'] as const) buyUnit(w, fire.id, t);
  for (const t of ['PS', 'PS', 'BAC', 'BRI'] as const) buyUnit(w, post.id, t);
  for (const t of ['SMUR', 'AMB'] as const) buyUnit(w, hosp.id, t);
  expect(w.units.length).toBeGreaterThanOrEqual(12);
  w.money = 60000;
  w.speed = 4;
  const start = w.t;
  let lowest = w.money;
  while (w.t < start + 5 * 86400) {
    tick(w, 250);
    for (const c of w.calls) {
      if (c.state !== 'bilan' || !c.prompt) continue;
      const open = majorChoices(w, c).filter((o) => o.enabled).map((o) => o.id);
      const best = c.prompt.options.filter((o) => open.includes(o.id)).sort((a, b) => b.success - a.success)[0];
      if (best) decideMajor(w, c, best.id);
    }
    regulate(w);
    if (Math.floor(w.t) % 600 < 60) await care(w, true);
    lowest = Math.min(lowest, w.money);
  }
  const done = w.majors.filter((m) => m.state !== 'actif');
  const won = done.filter((m) => m.state === 'reussi').length;
  for (const m of w.majors) console.log(m.kind.id, m.state, 'phase', m.phase, 'started', Math.round(m.startedAt / 3600), 'h, lasted', Math.round((m.endedAt - m.startedAt) / 60), 'min');
  console.log(`level 12: ${w.majors.length} crises (${won} won), money ${Math.round(w.money)}, lowest ${Math.round(lowest)}, rep ${w.reputation}`);
  expect(done.length).toBeGreaterThanOrEqual(2);
  expect(w.majors.filter((m) => m.state === 'actif').length).toBeLessThanOrEqual(1);
  expect(won / done.length).toBeGreaterThanOrEqual(0.3);
  expect(lowest).toBeGreaterThan(0);
  // Upgrades soak up part of the money a large service makes (over 1.3 M€ without them;
  // achievement rewards add some back).
  expect(w.buildings.reduce((n, b) => n + b.upgrades.length, 0)).toBeGreaterThanOrEqual(5);
  expect(w.money).toBeLessThan(800000);
});

test('a crisis can requisition a crew driving to a lesser call; that call waits for another', async () => {
  const { MAJORS } = await import('../sim/catalog/majors.ts');
  const { startMajor } = await import('../sim/majors.ts');
  const { createCall, spotOn } = await import('../sim/callfactory.ts');
  const w = fullFleet(9);
  const minor = createCall(w, CALL_KINDS.find((k) => k.family === 'police' && k.priority >= 2)!, spotOn(w, city.callEdges[3]), 'test');
  minor.qualified = true;
  w.calls.push(minor);
  const patrols = w.units.filter((u) => u.type === 'PS');
  dispatch(w, minor.id, patrols.map((u) => u.id));
  expect(minor.assigned.length).toBe(patrols.length);
  const m = startMajor(w, MAJORS.find((k) => k.id === 'otages')!);
  const crisis = w.calls.find((c) => c.id === m.callId)!;
  const picks = options(w, crisis.id).filter((o) => o.suggested);
  expect(picks.filter((o) => o.unit.type === 'PS').length).toBe(2);
  expect(picks.every((o) => o.diverted !== '')).toBe(true);
  dispatch(w, crisis.id, picks.map((o) => o.unit.id));
  expect(crisis.assigned.length).toBe(2);
  expect(minor.assigned.length).toBe(patrols.length - 2);
  // Everyday calls cannot take crews from one another.
  const other = createCall(w, minor.kind, spotOn(w, city.callEdges[9]), 'test');
  w.calls.push(other);
  expect(options(w, other.id).some((o) => o.unit.callId === minor.id)).toBe(false);
});

test('weather: the same seed gives the same days, and the seasons differ', async () => {
  const { today } = await import('../sim/weather.ts');
  const run = (seed: number, start: number) => {
    const w = newWorld(city, seed);
    w.startDate = start;
    const out: string[] = [];
    for (let d = 0; d < 60; d++) { w.t = d * 86400 + 3600; w.today = null; out.push(today(w).weather.id); }
    return out;
  };
  expect(run(4, Date.UTC(2026, 0, 1))).toEqual(run(4, Date.UTC(2026, 0, 1)));
  const winter = run(4, Date.UTC(2026, 0, 1)), summer = run(4, Date.UTC(2026, 6, 1));
  expect(winter.includes('neige')).toBe(true);
  expect(summer.includes('neige')).toBe(false);
  expect(summer.includes('canicule')).toBe(true);
  expect(new Set(winter).size).toBeGreaterThan(1);
});

test('weather: rain slows the roads, a heatwave brings faintings, roadworks are driven round', async () => {
  const { WEATHER } = await import('../sim/catalog/weather.ts');
  const { EVENTS } = await import('../sim/catalog/events.ts');
  const { today, updateConditions, callWeight } = await import('../sim/weather.ts');
  const { freshTree } = await import('../sim/traffic.ts');
  const w = newWorld(city, 3);
  w.t = 3 * 3600; // 10:00
  const t = today(w);
  const a = city.pois[0].node, b = city.pois[1].node;
  const set = (weather: keyof typeof WEATHER, events = t.events) => {
    w.today = { ...t, weather: WEATHER[weather], events };
    w.conditionsKey = '';
    updateConditions(w);
  };
  set('beau', []);
  const dry = freshTree(w, a).time[b];
  set('pluie', []);
  expect(freshTree(w, a).time[b]).toBeCloseTo(dry * 1.15, 3);
  set('neige', []);
  expect(freshTree(w, a).time[b]).toBeGreaterThan(dry * 1.5);
  // A heatwave: more faintings in the street.
  const malaise = CALL_KINDS.find((k) => k.id === 'malaise_vp')!;
  set('canicule', []);
  expect(callWeight(w, malaise)).toBeGreaterThan(2);
  set('beau', []);
  expect(callWeight(w, malaise)).toBe(1);
  // Roadworks on the first street of the fastest way: the new way avoids it.
  const way = pathTo(freshTree(w, a), b);
  const first = city.adj[way[0]].find((e) => city.edges[e].a === way[1] || city.edges[e].b === way[1])!;
  set('beau', [{ def: { ...EVENTS.find((e) => e.id === 'travaux')!, slow: 40 }, edges: [first] }]);
  expect(w.slowEdges.get(first)).toBe(40);
  const detour = pathTo(freshTree(w, a), b);
  expect(detour[1] === way[1] && detour.length > 2 ? 'same street' : 'detour').toBe('detour');
});

test('calendar: the 14th of July brings its fireworks evening', async () => {
  const { today, activeEvents } = await import('../sim/weather.ts');
  const w = newWorld(city, 5);
  w.startDate = Date.UTC(2026, 6, 14);
  w.t = 15 * 3600; // 22:00
  expect(today(w).events.map((e) => e.def.id)).toContain('quatorze');
  expect(activeEvents(w).map((e) => e.def.id)).toContain('quatorze');
  w.today = null;
  w.t = 86400 + 15 * 3600; // the 15th
  expect(today(w).events.map((e) => e.def.id)).not.toContain('quatorze');
});

test('crews tire on missions and recover at base; a resting crew is never proposed', async () => {
  const { rest, updateCrews, TIRED } = await import('../sim/crews.ts');
  const w = newWorld(city, 31);
  buildAt(w, 'caserne', centre.x, centre.y);
  const u = w.units[0];
  u.status = 'surplace';
  updateCrews(w, 10 * 3600);
  expect(u.fatigue).toBeGreaterThan(TIRED);
  u.status = 'dispo';
  const tired = u.fatigue;
  updateCrews(w, 2 * 3600);
  expect(u.fatigue).toBeLessThan(tired);
  expect(rest(w, u.id)).toBe(true);
  expect(u.status).toBe('repos');
  const { createCall, spotOn } = await import('../sim/callfactory.ts');
  const call = createCall(w, CALL_KINDS[0], spotOn(w, city.callEdges[5]), 'x');
  w.calls.push(call);
  expect(options(w, call.id).some((o) => o.unit.id === u.id)).toBe(false);
  updateCrews(w, 12 * 3600);
  expect(u.status).toBe('dispo');
});

test('worn vehicles break down; regular services keep them on the road', async () => {
  const { service } = await import('../sim/crews.ts');
  const career = (serviced: boolean) => {
    const w = newWorld(city, 42);
    buildAt(w, 'caserne', centre.x, centre.y);
    w.speed = 4;
    while (w.t < 3 * 86400) {
      tick(w, 250);
      regulate(w);
      if (Math.floor(w.t) % 600 < 60) {
        manage(w);
        if (serviced) for (const u of w.units) if (u.wear > 35 && w.money > 20000) service(w, u.id);
      }
    }
    return { breakdowns: w.stats.breakdowns, money: w.money, wear: Math.max(...w.units.map((u) => u.wear)) };
  };
  const plain = career(false), kept = career(true);
  console.log('breakdowns without service', plain.breakdowns, 'with', kept.breakdowns);
  expect(plain.breakdowns).toBeGreaterThan(0);
  expect(kept.breakdowns).toBeLessThan(plain.breakdowns);
});

test('upgrades: locked by level, paid once, and each one changes its rule', async () => {
  const { buyUpgrade, cannotUpgrade, maxSlots } = await import('../sim/upgrades.ts');
  const { updateCrews, turnout } = await import('../sim/crews.ts');
  const w = newWorld(city, 51);
  const fire = buildAt(w, 'caserne', centre.x, centre.y)!;
  w.money = 1e6;
  expect(cannotUpgrade(w, fire, 'dortoir')).toBe('Niveau 4');
  expect(buyUpgrade(w, fire.id, 'dortoir')).toBe(false);
  w.level = 25;
  const before = w.money;
  expect(buyUpgrade(w, fire.id, 'dortoir')).toBe(true);
  expect(w.money).toBe(before - 25000);
  expect(buyUpgrade(w, fire.id, 'dortoir')).toBe(false);
  expect(cannotUpgrade(w, fire, 'brules')).toBe('Pas ici');
  // Dortoir: twice the recovery.
  const u = w.units[0];
  u.fatigue = 80;
  updateCrews(w, 3600);
  const rested = 80 - u.fatigue;
  const w2 = newWorld(city, 51);
  buildAt(w2, 'caserne', centre.x, centre.y);
  w2.units[0].fatigue = 80;
  updateCrews(w2, 3600);
  expect(rested).toBeCloseTo((80 - w2.units[0].fatigue) * 2, 5);
  // Salle de garde: leaves in 15 s.
  expect(turnout(w, u)).toBe(60);
  buyUpgrade(w, fire.id, 'garde');
  expect(turnout(w, u)).toBe(15);
  // Burns unit: a fire victim brought to its hospital pays half as much again.
  const hosp = buySite(w, city.pois.findIndex((p) => p.kind === 'hospital'))!;
  expect(maxSlots(hosp)).toBe(6);
  buyUpgrade(w, hosp.id, 'heliport');
  expect(maxSlots(hosp)).toBe(8);
  const fee = async (burns: boolean) => {
    const { arrive } = await import('../sim/units.ts');
    const { createCall, spotOn } = await import('../sim/callfactory.ts');
    if (burns && !hosp.upgrades.includes('brules')) buyUpgrade(w, hosp.id, 'brules');
    const call = createCall(w, CALL_KINDS.find((k) => k.family === 'feu')!, spotOn(w, city.callEdges[2]), 'x');
    w.calls.push(call);
    const v = w.units.find((x) => x.type === 'VSAV')!;
    Object.assign(v, { status: 'transport', callId: call.id, x: hosp.x, y: hosp.y });
    const m = w.money;
    arrive(w, v);
    return w.money - m;
  };
  const plain = await fee(false);
  expect(await fee(true)).toBe(plain * 1.5);
});

test('achievements: every goal reads a fresh world, a career wins several, each is paid once and saved', async () => {
  const { ACHIEVEMENTS } = await import('../sim/catalog/achievements.ts');
  const { checkAchievements } = await import('../sim/achievements.ts');
  const { snapshotSave } = await import('../src/persistence.ts');
  const { restore } = await import('../src/game.ts');
  const fresh = newWorld(city, 61);
  for (const a of ACHIEVEMENTS) {
    const [value, target] = a.goal(fresh);
    expect(Number.isFinite(value) && target > 0).toBe(true);
  }
  expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
  expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  const w = newWorld(city, 42);
  buildAt(w, 'caserne', centre.x, centre.y);
  w.speed = 4;
  while (w.t < 3 * 86400) {
    tick(w, 250);
    regulate(w);
    if (Math.floor(w.t) % 600 < 60) { manage(w); await care(w); }
  }
  console.log('achievements after 3 days:', w.achievements.join(', '));
  expect(w.achievements.length).toBeGreaterThanOrEqual(5);
  const money = w.money, count = w.achievements.length;
  checkAchievements(w);
  expect(w.achievements.length).toBe(count);
  expect(w.money).toBe(money);
  const back = restore(city, JSON.parse(JSON.stringify(snapshotSave(w))));
  expect(back.achievements).toEqual(w.achievements);
  expect(back.records.bestQualifyRun).toBe(w.records.bestQualifyRun);
});

test('ranks follow the level, with a promotion every few levels', async () => {
  const { rankOf, promotedAt, RANKS } = await import('../sim/catalog/ranks.ts');
  expect(rankOf(1).title).toBe('Sapeur');
  expect(rankOf(12).title).toBe('Capitaine');
  expect(rankOf(25).title).toBe('Contrôleur général');
  expect(promotedAt(3)).toBe(true);
  expect(promotedAt(4)).toBe(false);
  expect(RANKS.length).toBe(10);
});

test('departures have a cost: sending the only nearby crew leaves part of town uncovered', async () => {
  const { departureCost } = await import('../sim/coverage.ts');
  const { presets } = await import('../sim/calls.ts');
  const { createCall, spotOn } = await import('../sim/callfactory.ts');
  const w = newWorld(city, 71);
  w.level = 25;
  w.money = 1e6;
  const west = buildAt(w, 'caserne', city.width * 0.2, city.height * 0.5)!;
  const east = buildAt(w, 'caserne', city.width * 0.8, city.height * 0.5)!;
  expand(w, west.id);
  buyUnit(w, east.id, 'VSAV');
  const lone = w.units.find((u) => u.building === east.id)!;
  const cost = departureCost(w, [lone.id]);
  expect(cost.loss).toBeGreaterThan(0.05);
  expect(cost.where.length).toBeGreaterThan(0);
  // A second VSAV in the west: a call in the middle offers the fast one and the one that keeps coverage.
  buyUnit(w, west.id, 'VSAV');
  const mid = city.callEdges.find((e) => Math.abs(city.nx[city.edges[e].a] - city.width * 0.55) < 200 && Math.abs(city.ny[city.edges[e].a] - city.height * 0.5) < 400)!;
  const call = createCall(w, CALL_KINDS.find((k) => k.id === 'malaise_vp')!, spotOn(w, mid), 'x');
  call.qualified = true;
  w.calls.push(call);
  const list = presets(w, call.id);
  expect(list[0].id).toBe('rapide');
  for (const p of list.slice(1)) expect(p.loss).toBeLessThanOrEqual(list[0].loss + 1e-9);
  expect(new Set(list.map((p) => p.units.join())).size).toBe(list.length);
});

test('prepositioning: a vehicle waits at a crossing and leaves from there without turnout', async () => {
  const { startPosting, postAt, standDown } = await import('../sim/posting.ts');
  const { createCall, spotOn } = await import('../sim/callfactory.ts');
  const w = newWorld(city, 72);
  const fire = buildAt(w, 'caserne', city.width * 0.2, city.height * 0.5)!;
  const u = w.units[0];
  const far = nearestNode(city, city.width * 0.8, city.height * 0.5);
  const call = createCall(w, CALL_KINDS[0], spotOn(w, city.adj[far][0]), 'x');
  w.calls.push(call);
  const fromBase = options(w, call.id).find((o) => o.unit.id === u.id)!.eta;
  expect(startPosting(w, u.id)).toBe(true);
  expect(postAt(w, far)).toBe(true);
  expect(u.status).toBe('poste');
  for (let i = 0; i < 4 * 60 * 20 && u.path.length > 1; i++) tick(w, 250);
  expect(u.path.length).toBe(1);
  const fromPost = options(w, call.id).find((o) => o.unit.id === u.id)!.eta;
  expect(fromPost).toBeLessThan(fromBase / 2);
  expect(standDown(w, u.id)).toBe(true);
  expect(['retour', 'dispo']).toContain(u.status);
  expect(fire.id).toBeTruthy();
});

test('waves are announced ten minutes ahead', async () => {
  const { today, updateConditions } = await import('../sim/weather.ts');
  const w = newWorld(city, 73);
  w.startDate = Date.UTC(2026, 10, 23); // a Monday
  buildAt(w, 'caserne', centre.x, centre.y);
  w.t = (16.3 - 7 - 0.1) * 3600; // 16:12
  expect(today(w).events.map((e) => e.def.id)).toContain('ecoles');
  updateConditions(w);
  expect(w.log.some((l) => l.text.startsWith('Dans 10 min · Sortie des écoles'))).toBe(true);
  const n = w.log.length;
  updateConditions(w);
  expect(w.log.length).toBe(n);
});

test('the engine cues sounds and marks the map: a call rings, a crew arrives, a call closes', () => {
  const w = newWorld(city, 81);
  buildAt(w, 'caserne', centre.x, centre.y);
  w.speed = 4;
  w.nextCallAt = 0;
  const heard = new Set<string>();
  let last = 0;
  for (let i = 0; i < 4 * 60 * 30 && !w.fx.some((f) => f.kind === 'stamp'); i++) {
    tick(w, 250);
    if (w.cue.id !== last) { last = w.cue.id; heard.add(w.cue.name); }
    regulate(w);
    if (w.cue.id !== last) { last = w.cue.id; heard.add(w.cue.name); }
  }
  expect([...heard]).toEqual(expect.arrayContaining(['appel', 'depart', 'radio']));
  const kinds = new Set(w.fx.map((f) => f.kind));
  for (const k of ['ring', 'bubble', 'flash', 'stamp']) expect(kinds.has(k as never)).toBe(true);
  expect(w.fx.length).toBeLessThanOrEqual(40);
});
