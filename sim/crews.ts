// Crews and vehicles wear out: crews tire with every intervention and rest at
// their base; vehicles wear with the kilometres and break down now and then.
import { homeHas } from './upgrades.ts';
import { UNITS } from './catalog/units.ts';
import { hourOf } from './clock.ts';
import { spend } from './economy.ts';
import { euros, say } from './log.ts';
import type { Unit, World } from './types.ts';

/** Above this, a crew drives slower and works slower. */
export const TIRED = 70;
export const EXHAUSTED = 90;

export const CREW = {
  /** Fatigue points per game hour out on a mission (×1.5 at night), and working on scene. */
  outPerHour: 8,
  workPerHour: 12,
  /** Recovery per game hour at the base, and resting. */
  basePerHour: 6,
  restPerHour: 22,
  /** A resting crew comes back on duty here. */
  backAt: 10,
  /** Wear points per kilometre driven. */
  wearPerKm: 0.25,
  /** Breakdown risk at each return to base, per wear point above 30. */
  breakdownPerWear: 0.0012,
  repairHours: 3,
  serviceHours: 1,
  /** Share of the vehicle's price: a repair, a preventive service. */
  repairCost: 0.08,
  serviceCost: 0.04,
};

// What the station's upgrades change.
const recovery = (w: World, u: Unit) => (homeHas(w, u, 'dortoir') ? 2 : 1);
const breakdownFactor = (w: World, u: Unit) => (homeHas(w, u, 'atelier') ? 0.5 : 1);
const repairCostFactor = (w: World, u: Unit) => (homeHas(w, u, 'atelier') ? 0.5 : 1);
const repairTimeFactor = (w: World, u: Unit) => (homeHas(w, u, 'atelier') ? 0.5 : 1);

/** Seconds between the alarm and the vehicle leaving its base. */
export const turnout = (w: World, u: Unit) => (homeHas(w, u, 'garde') ? 15 : 60);

export const isTired = (u: Unit) => u.fatigue > TIRED;
/** Speed and work-rate factor of a tired crew. */
export const pace = (u: Unit) => (isTired(u) ? 0.92 : 1);

/** Every step: fatigue goes up on missions and down at the base; resting and repairs count down. */
export function updateCrews(w: World, dt: number) {
  const hours = dt / 3600;
  const h = hourOf(w.t);
  const night = h >= 23 || h < 6 ? 1.5 : 1;
  for (const u of w.units) {
    if (u.status === 'dispo') u.fatigue -= CREW.basePerHour * hours * recovery(w, u);
    else if (u.status === 'repos') {
      u.fatigue -= CREW.restPerHour * hours * recovery(w, u);
      if (u.fatigue <= CREW.backAt) {
        u.status = 'dispo';
        say(w, `${u.name} · fin du repos, de nouveau disponible`, 'info');
      }
    } else if (u.status === 'atelier') {
      u.wait -= dt;
      if (u.wait <= 0) {
        u.status = 'dispo';
        say(w, `${u.name} · sorti de l'atelier`, 'info');
      }
    } else if (u.status !== 'retour') {
      const working = u.status === 'surplace' && w.calls.some((c) => c.id === u.callId && c.state === 'traitement');
      u.fatigue += (working ? CREW.workPerHour : CREW.outPerHour) * night * hours;
    }
    u.fatigue = Math.max(0, Math.min(100, u.fatigue));
  }
}

/** Called for each metre a vehicle covers. */
export function wearOut(u: Unit, metres: number) {
  u.wear = Math.min(100, u.wear + (metres / 1000) * CREW.wearPerKm);
}

/** Back at its base: a worn vehicle may break down. */
export function checkBreakdown(w: World, u: Unit) {
  const p = Math.max(0, u.wear - 30) * CREW.breakdownPerWear * breakdownFactor(w, u);
  if (w.rng() >= p) return;
  const cost = Math.round(UNITS[u.type].price * CREW.repairCost * repairCostFactor(w, u));
  w.money -= cost;
  w.stats.spent += cost;
  w.stats.breakdowns++;
  u.status = 'atelier';
  u.wait = CREW.repairHours * 3600 * repairTimeFactor(w, u);
  u.wear = 20;
  say(w, `${u.name} en panne · atelier ${Math.round(u.wait / 3600)} h, réparation ${euros(cost)}`, 'bad', true);
}

/** The player sends a crew to rest (only from the base). */
export function rest(w: World, id: string): boolean {
  const u = w.units.find((x) => x.id === id);
  if (!u || u.status !== 'dispo') return false;
  u.status = 'repos';
  say(w, `${u.name} · équipage au repos`, 'info');
  w.dirty = true;
  return true;
}

export const servicePrice = (w: World, u: Unit) => Math.round(UNITS[u.type].price * CREW.serviceCost * repairCostFactor(w, u));

/** A preventive service: wear back to 0, an hour in the workshop. */
export function service(w: World, id: string): boolean {
  const u = w.units.find((x) => x.id === id);
  if (!u || u.status !== 'dispo') return false;
  if (!spend(w, servicePrice(w, u), `Révision de ${u.name}`)) return false;
  u.status = 'atelier';
  u.wait = CREW.serviceHours * 3600 * repairTimeFactor(w, u);
  u.wear = 0;
  w.dirty = true;
  return true;
}
