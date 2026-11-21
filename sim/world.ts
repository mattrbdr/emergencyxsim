// The career: creates the world and advances it. Every rule lives in its own
// module (calls, units, economy, progression, buildings); this file only orders them.
import { checkAchievements, emptyRecords } from './achievements.ts';
import { START_MONEY, START_REPUTATION } from './catalog/levels.ts';
import { RULES } from './catalog/rules.ts';
import type { City } from './city.ts';
import { spawnCall, updateCall } from './calls.ts';
import { TIME_SCALE } from './clock.ts';
import { chargeUpkeep } from './economy.ts';
import { emptyDay, updateContracts } from './contracts.ts';
import { updateTutorial } from './tutorial.ts';
import { firstMajorAt, updateMajors } from './majors.ts';
import { say } from './log.ts';
import { mulberry } from './rng.ts';
import type { World } from './types.ts';
import { moveUnit } from './units.ts';
import { updateCrews } from './crews.ts';
import { DEFAULT_START, updateConditions } from './weather.ts';

export function newWorld(city: City, seed: number): World {
  const w: World = {
    city, seed, rng: mulberry(seed || 1), t: 0, speed: 1, paused: false, seq: 0,
    money: START_MONEY, xp: 0, level: 1, seenLevel: 1, reputation: START_REPUTATION,
    buildings: [], units: [], calls: [], nextCallAt: 40, nextId: 1,
    stats: { calls: 0, saved: 0, lost: 0, failed: 0, earned: 0, spent: 0, responseSum: 0, responses: 0, qualifyRight: 0, qualifyWrong: 0, breakdowns: 0 },
    log: [], toast: { id: 0, t: 0, text: '', tone: 'info' }, logId: 0, dirty: true,
    stationTrees: new Map(), callTrees: new Map(),
    cam: { cx: city.width / 2, cy: city.height / 2, zoom: 0.2, tx: city.width / 2, ty: city.height / 2, tz: 0.2, seq: 1, touched: false },
    view: { w: 0, h: 0 }, pointers: new Map(), pinch: null, posting: '',
    cue: { id: 0, name: '', seq: -1 }, fx: [], fxId: 0, settings: { sound: true, sirens: true, motion: true }, difficulty: 'normal', placing: null, overlay: false,
    contracts: [], dayStats: emptyDay(1), streak: 0, tutorial: 0, tip: '', tipsSeen: [],
    majors: [], nextMajorAt: firstMajorAt, majorReport: null, blocked: new Set(),
    achievements: [], records: emptyRecords(),
    startDate: DEFAULT_START, today: null, conditionsKey: '', announced: [], trafficMul: 1, slowEdges: new Map(),
  };
  say(w, `Prise de garde à ${city.name}. Aucune caserne pour l'instant, la première est offerte.`, 'info', true);
  return w;
}

/** Advance by `realMs` of wall time at the current speed. */
export function tick(w: World, realMs: number) {
  for (const u of w.units) { u.px = u.x; u.py = u.y; }
  updateTutorial(w);
  if (w.paused || w.buildings.length === 0) return;
  let dt = (realMs / 1000) * TIME_SCALE * w.speed;
  while (dt > 0) {
    const step = Math.min(dt, 5);
    advance(w, step);
    dt -= step;
  }
  w.seq++;
}

function advance(w: World, dt: number) {
  const before = w.t;
  w.t += dt;
  updateConditions(w);
  if (w.t >= w.nextCallAt) spawnCall(w);
  updateMajors(w, dt);
  for (const u of w.units) moveUnit(w, u, dt);
  updateCrews(w, dt);
  for (const call of w.calls) if (call.state !== 'clos') updateCall(w, call, dt);
  chargeUpkeep(w, before);
  updateContracts(w);
  updateTutorial(w);
  if (Math.floor(before / 60) !== Math.floor(w.t / 60)) checkAchievements(w);
  // Hospitals discharge a patient every RULES.dischargeEvery.
  if (Math.floor(before / RULES.dischargeEvery) !== Math.floor(w.t / RULES.dischargeEvery)) for (const b of w.buildings) b.patients = Math.max(0, b.patients - 1);
  if (w.calls.length > 60) w.calls = w.calls.filter((c) => c.state !== 'clos' || w.t - c.closedAt < 3600);
  for (const key of [...w.callTrees.keys()]) {
    const c = w.calls.find((x) => x.id === key);
    if (!c || c.state === 'clos') w.callTrees.delete(key);
  }
}
