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
    for (let i = 0; i < 400; i++) if (placesAt(city, pickStreet(city, kind, rng, () => false)).has(place as never)) hit++;
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
    const w = newWorld(city, 77);
    w.level = 12;
    w.money = 1e8;
    const fire1 = buildAt(w, 'caserne', centre.x, centre.y)!;
    const fire2 = buildAt(w, 'caserne', centre.x + 900, centre.y + 400)!;
    const post = buySite(w, city.pois.findIndex((p) => p.kind === 'police'))!;
    const hosp = buySite(w, city.pois.findIndex((p) => p.kind === 'hospital'))!;
    for (const b of [fire1, fire2, post, hosp]) for (let i = 0; i < 3; i++) expand(w, b.id);
    for (const t of ['FPT', 'FPT', 'EPA', 'VSAV', 'VSAV', 'VSAV', 'VTU', 'VTU'] as const) buyUnit(w, fire1.id, t);
    for (const t of ['FPTGP', 'VPC', 'CMIC', 'VSR', 'VPMA', 'FPT'] as const) buyUnit(w, fire2.id, t);
    for (const t of ['PS', 'PS', 'PS', 'BAC', 'BAC', 'BRI'] as const) buyUnit(w, post.id, t);
    for (const t of ['SMUR', 'AMB', 'AMB'] as const) buyUnit(w, hosp.id, t);
    w.nextCallAt = Infinity;
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
