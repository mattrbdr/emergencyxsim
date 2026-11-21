// The career on disk: app:/data/city.json (the player's town) and
// app:/data/save.json (everything else). Saves are started and not awaited, so
// a tick never waits on storage.
import type { Storage } from '../app.contract.d.ts';
import type { CityFile } from '../sim/city.ts';
import type { Building, Unit, World } from '../sim/types.ts';

export const CITY_FILE = 'app:/data/city.json';
export const SAVE_FILE = 'app:/data/save.json';
export const GRANTS = ['fs.read app:/data', 'fs.write app:/data'];

const VERSION = 2;

export interface Save {
  version: number;
  city: string;
  seed: number;
  t: number;
  speed: number;
  money: number;
  xp: number;
  level: number;
  seenLevel: number;
  reputation: number;
  nextId: number;
  nextCallAt: number;
  stats: World['stats'];
  buildings: Building[];
  units: Pick<Unit, 'id' | 'type' | 'name' | 'building' | 'missions'>[];
  log: World['log'];
  // Since v2.
  contracts?: World['contracts'];
  dayStats?: World['dayStats'];
  streak?: number;
  tutorial?: number;
  tipsSeen?: string[];
  nextMajorAt?: number;
}

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

async function readJson<T>(storage: Storage, path: string): Promise<T | null> {
  try {
    return JSON.parse(new TextDecoder().decode(await storage.fs.readFile(path))) as T;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'ENOENT') return null;
    throw e;
  }
}

export const loadCityFile = (storage: Storage) => readJson<CityFile>(storage, CITY_FILE);
export const loadSave = async (storage: Storage) => {
  const save = await readJson<Save>(storage, SAVE_FILE);
  // v1 (before contracts and the tutorial) is read as is; restore fills the gaps.
  return save && (save.version === VERSION || save.version === 1) ? save : null;
};

export function saveCity(storage: Storage, city: CityFile) {
  return storage.fs.atomicWriteFile(CITY_FILE, encode(city));
}

export function snapshotSave(w: World): Save {
  return {
    version: VERSION, city: w.city.name, seed: w.seed, t: w.t, speed: w.speed,
    money: w.money, xp: w.xp, level: w.level, seenLevel: w.seenLevel, reputation: w.reputation,
    nextId: w.nextId, nextCallAt: w.nextCallAt, stats: w.stats, buildings: w.buildings,
    units: w.units.map((u) => ({ id: u.id, type: u.type, name: u.name, building: u.building, missions: u.missions })),
    log: w.log.slice(0, 30),
    contracts: w.contracts, dayStats: w.dayStats, streak: w.streak, tutorial: w.tutorial, tipsSeen: w.tipsSeen, nextMajorAt: w.nextMajorAt,
  };
}

/** Starts a save; resolves when written (callers usually don't wait). */
export function writeSave(storage: Storage, w: World) {
  w.dirty = false;
  return storage.fs.atomicWriteFile(SAVE_FILE, encode(snapshotSave(w)));
}

export async function deleteCareer(storage: Storage) {
  for (const path of [SAVE_FILE, CITY_FILE]) {
    try { await storage.fs.rm(path); } catch { /* not there */ }
  }
}
