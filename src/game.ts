// The one running career, held by the data module. Starting, resuming from
// disk, switching town and saving all go through here.
import type { Storage } from '../app.contract.d.ts';
import demoFile from '../data/city.json';
import { BUILDINGS } from '../sim/catalog/buildings.ts';
import { CALL_KINDS } from '../sim/catalog/calls.ts';
import { MAJORS } from '../sim/catalog/majors.ts';
import { UNITS } from '../sim/catalog/units.ts';
import { loadCity, type City, type CityFile } from '../sim/city.ts';
import { mulberry } from '../sim/rng.ts';
import type { Call, Unit, World } from '../sim/types.ts';
import { newWorld } from '../sim/world.ts';
import { STEPS } from '../sim/tutorial.ts';
import { deleteCareer, loadCityFile, loadSave, saveCity, writeSave, type Save } from './persistence.ts';

const demo = demoFile as unknown as CityFile;

export const game = {
  world: newWorld(loadCity(demo), 1),
  /** A town is chosen (demo or downloaded) and the career is running. */
  ready: false,
  booted: false,
  ticksSinceSave: 0,
};

/** First request of a launch: resume the saved career if there is one. */
export async function boot(storage: Storage, epoch = 0) {
  if (game.booted) return;
  game.booted = true;
  try {
    const save = await loadSave(storage);
    if (!save) return;
    const file = (await loadCityFile(storage)) ?? demo;
    if (file.name !== save.city) return;
    game.world = restore(loadCity(file), save, epoch);
    game.ready = true;
  } catch {
    // A damaged save starts a new career rather than blocking the game.
  }
}

/** Starts a career in `file`, keeping the canvas size the old world learnt. */
export function startCareer(storage: Storage, file: CityFile, seed: number, persistCity: boolean, date = 0) {
  const view = game.world.view;
  game.world = newWorld(loadCity(file), Math.floor(Math.abs(seed)) % 2147483646 || 1);
  if (date > 0) game.world.startDate = midnight(date);
  game.world.view = view;
  game.ready = true;
  if (persistCity) saveCity(storage, file).catch(() => {});
  else storage.fs.rm('app:/data/city.json').catch(() => {});
  save(storage);
}

export const demoCity = () => demo;

export async function resetCareer(storage: Storage) {
  await deleteCareer(storage);
  game.ready = false;
  game.world = newWorld(loadCity(demo), 1);
}

/** Saves now if anything changed (not awaited by callers). */
export function save(storage: Storage) {
  game.ticksSinceSave = 0;
  if (!game.ready) return;
  writeSave(storage, game.world).catch(() => { game.world.dirty = true; });
}

/** Called each tick: saves every ~5 s of play when the career changed. */
export function autosave(storage: Storage) {
  if (++game.ticksSinceSave >= 20 && game.world.dirty) save(storage);
}

/** Midnight UTC of the day that contains `ms`. */
const midnight = (ms: number) => Math.floor(ms / 86400000) * 86400000;

export function restore(city: City, s: Save, epoch = 0): World {
  const w = newWorld(city, s.seed);
  Object.assign(w, {
    t: s.t, speed: s.speed, money: s.money, xp: s.xp, level: s.level, seenLevel: s.seenLevel,
    reputation: s.reputation, nextId: s.nextId, nextCallAt: s.nextCallAt, stats: s.stats,
    buildings: s.buildings.filter((b) => BUILDINGS[b.kind] && b.node < city.nx.length),
    log: s.log, dirty: false,
    contracts: s.contracts ?? [], streak: s.streak ?? 0, tipsSeen: s.tipsSeen ?? [],
    // A career started before the tutorial existed has no need of it.
    tutorial: s.tutorial ?? STEPS.length,
  });
  if (s.nextMajorAt !== undefined) w.nextMajorAt = s.nextMajorAt;
  if (s.dayStats) w.dayStats = s.dayStats;
  // A career saved before the calendar starts on the day it is resumed.
  if (s.startDate) w.startDate = s.startDate;
  else if (epoch > 0) w.startDate = midnight(epoch) - Math.floor(s.t / 86400) * 86400000;
  // A fresh stream of random numbers, moved on by the time already played.
  w.rng = mulberry((s.seed + Math.floor(s.t)) % 2147483646 || 1);
  w.units = s.units
    .map((u): Unit | null => {
      const b = w.buildings.find((x) => x.id === u.building);
      if (!b || !UNITS[u.type]) return null;
      return {
        id: u.id, type: u.type, service: UNITS[u.type].service, name: u.name, building: b.id, home: b.node,
        path: [b.node], along: 0, flight: null, x: b.x, y: b.y, px: b.x, py: b.y, heading: 0,
        status: 'dispo', callId: '', wait: 0, missions: u.missions,
      };
    })
    .filter((u): u is Unit => u !== null);
  restoreOperations(w, s);
  return w;
}

/** Calls under way come back waiting for crews (every vehicle is at its base after a
 * reload), with the work already done kept and a few minutes' grace; a major incident
 * comes back in the phase it had reached. */
function restoreOperations(w: World, s: Save) {
  const nodes = w.city.nx.length;
  const m = s.major;
  const kind = m && MAJORS.find((k) => k.id === m.kind);
  if (m && kind && m.spot.node < nodes) {
    w.majors = [{ ...m, kind }];
    for (const e of s.blocked ?? []) if (e < w.city.edges.length) w.blocked.add(e);
  }
  w.calls = (s.calls ?? [])
    .filter((c) => c.node < nodes && (!c.majorId || w.majors.some((x) => x.id === c.majorId)))
    .map((c): Call => ({
      ...c,
      kind: CALL_KINDS.find((k) => k.id === c.kind.id) ?? c.kind,
      assigned: [],
      state: c.state === 'bilan' ? 'bilan' : c.qualified ? 'attente' : 'nouveau',
      deadline: Math.max(c.deadline, w.t + 8 * 60),
    }));
}
