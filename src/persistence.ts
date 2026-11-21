// The career on disk: app:/data/city.json (the player's town) and
// app:/data/save.json (everything else). Saves are started and not awaited, so
// a tick never waits on storage.
import type { Storage } from '../app.contract.d.ts';
import type { CityFile } from '../sim/city.ts';
import type { Fugitive, Major } from '../sim/majors.ts';
import type { Building, Call, Unit, World } from '../sim/types.ts';

export const CITY_FILE = 'app:/data/city.json';
export const SAVE_FILE = 'app:/data/save.json';
export const GRANTS = ['fs.read app:/data', 'fs.write app:/data'];

const VERSION = 3;

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
  units: (Pick<Unit, 'id' | 'type' | 'name' | 'building' | 'missions'> & Partial<Pick<Unit, 'fatigue' | 'wear' | 'status' | 'wait'>>)[];
  log: World['log'];
  // Since v2.
  contracts?: World['contracts'];
  dayStats?: World['dayStats'];
  streak?: number;
  tutorial?: number;
  tipsSeen?: string[];
  nextMajorAt?: number;
  // Since v3: the calls under way and the major incident in progress.
  calls?: Omit<Call, 'assigned'>[];
  major?: Omit<Major, 'kind'> & { kind: string; fugitive: Fugitive | null };
  blocked?: number[];
  startDate?: number;
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
  return save && (save.version >= 1 && save.version <= VERSION) ? save : null;
};

export function saveCity(storage: Storage, city: CityFile) {
  return storage.fs.atomicWriteFile(CITY_FILE, encode(city));
}

export function snapshotSave(w: World): Save {
  return {
    version: VERSION, city: w.city.name, seed: w.seed, t: w.t, speed: w.speed,
    money: w.money, xp: w.xp, level: w.level, seenLevel: w.seenLevel, reputation: w.reputation,
    nextId: w.nextId, nextCallAt: w.nextCallAt, stats: w.stats, buildings: w.buildings,
    units: w.units.map((u) => ({
      id: u.id, type: u.type, name: u.name, building: u.building, missions: u.missions,
      fatigue: Math.round(u.fatigue), wear: Math.round(u.wear), status: u.status, wait: Math.round(u.wait),
    })),
    log: w.log.slice(0, 30),
    contracts: w.contracts, dayStats: w.dayStats, streak: w.streak, tutorial: w.tutorial, tipsSeen: w.tipsSeen, nextMajorAt: w.nextMajorAt,
    calls: w.calls.filter((c) => c.state !== 'clos').map(({ assigned: _, ...c }) => c),
    major: majorToSave(w),
    blocked: [...w.blocked],
    startDate: w.startDate,
  };
}

function majorToSave(w: World): Save['major'] {
  const m = w.majors.find((x) => x.state === 'actif');
  return m ? { ...m, kind: m.kind.id } : undefined;
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
