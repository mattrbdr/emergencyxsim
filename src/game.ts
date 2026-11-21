// The one running career, held by the data module. Starting, resuming from
// disk, switching town and saving all go through here.
import type { Storage } from '../app.contract.d.ts';
import demoFile from '../data/city.json';
import { BUILDINGS } from '../sim/catalog/buildings.ts';
import { UNITS } from '../sim/catalog/units.ts';
import { loadCity, type City, type CityFile } from '../sim/city.ts';
import { mulberry } from '../sim/rng.ts';
import type { Unit, World } from '../sim/types.ts';
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
export async function boot(storage: Storage) {
  if (game.booted) return;
  game.booted = true;
  try {
    const save = await loadSave(storage);
    if (!save) return;
    const file = (await loadCityFile(storage)) ?? demo;
    if (file.name !== save.city) return;
    game.world = restore(loadCity(file), save);
    game.ready = true;
  } catch {
    // A damaged save starts a new career rather than blocking the game.
  }
}

/** Starts a career in `file`, keeping the canvas size the old world learnt. */
export function startCareer(storage: Storage, file: CityFile, seed: number, persistCity: boolean) {
  const view = game.world.view;
  game.world = newWorld(loadCity(file), Math.floor(Math.abs(seed)) % 2147483646 || 1);
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

function restore(city: City, s: Save): World {
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
  if (s.dayStats) w.dayStats = s.dayStats;
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
  return w;
}
