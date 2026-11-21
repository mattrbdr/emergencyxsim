// The day's conditions: weather and town events, drawn from the career's seed and
// the day number (so a career always has the same days, and nothing to save).
// They slow streets, bring their own calls and draw calls to some places.
import type { CallKind } from './catalog/calls.ts';
import { EVENTS, type EventDef } from './catalog/events.ts';
import type { Place } from './catalog/places.ts';
import { WEATHER, weatherOdds, type WeatherDef } from './catalog/weather.ts';
import { hourOf } from './clock.ts';
import { say } from './log.ts';
import { placesAt } from './places.ts';
import { mulberry } from './rng.ts';
import type { World } from './types.ts';

const DAY_MS = 86400000;
/** The calendar of a career created before dates were kept (and of tests). */
export const DEFAULT_START = Date.UTC(2026, 0, 1);

export interface DayEvent { def: EventDef; edges: number[] }
export interface Today { day: number; date: Date; weather: WeatherDef; events: DayEvent[] }

const dayOfShift = (w: World) => 1 + Math.floor(w.t / 86400);
/** Hour on the shift clock: 7 to 31. */
export const shiftHour = (t: number) => (hourOf(t) < 7 ? hourOf(t) + 24 : hourOf(t));

export const dateOf = (w: World, day: number) => new Date(w.startDate + (day - 1) * DAY_MS);

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const dateText = (d: Date) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

/** Weather and events of the current shift day (worked out once per day). */
export function today(w: World): Today {
  const day = dayOfShift(w);
  if (w.today?.day === day) return w.today;
  const rng = mulberry(((w.seed * 7919) ^ (day * 104729)) % 2147483646 || 1);
  const date = dateOf(w, day);
  let r = rng();
  let weather = WEATHER.beau;
  for (const [id, p] of weatherOdds(date.getUTCMonth())) {
    r -= p;
    if (r <= 0) { weather = WEATHER[id]; break; }
  }
  const events: DayEvent[] = [];
  for (const def of EVENTS) {
    const roll = rng();
    if (!def.when(date, roll)) continue;
    const edges = streetsFor(w, def, rng);
    if (def.slows && def.slows !== 'axes' && edges.length === 0) continue; // no stadium, no market in this town
    events.push({ def, edges });
  }
  w.today = { day, date, weather, events };
  return w.today;
}

function streetsFor(w: World, def: EventDef, rng: () => number): number[] {
  const { city } = w;
  if (!def.slows) return [];
  if (def.slows === 'axes') return city.edges.flatMap((e, i) => (e.cls <= 1 ? [i] : []));
  if (def.slows === 'chantiers') {
    const out: number[] = [];
    for (let i = 0; i < 40 && out.length < 3; i++) {
      const e = city.callEdges[Math.floor(rng() * city.callEdges.length)];
      if (city.edges[e].cls >= 1 && !out.includes(e)) out.push(e);
    }
    return out;
  }
  const place = def.slows;
  return city.edges.flatMap((_, i) => (placesAt(city, i).has(place) ? [i] : []));
}

export const activeEvents = (w: World) => {
  const h = shiftHour(w.t);
  return today(w).events.filter((e) => h >= e.def.from && h < e.def.to);
};

/** Every step: when the day or the running events change, routes are worked out again. */
export function updateConditions(w: World) {
  const t = today(w);
  const active = activeEvents(w);
  const key = `${t.day}|${active.map((e) => e.def.id).join(',')}`;
  if (key === w.conditionsKey) return;
  const newDay = !w.conditionsKey.startsWith(`${t.day}|`);
  w.conditionsKey = key;
  w.trafficMul = t.weather.traffic;
  w.slowEdges = new Map();
  for (const e of active) for (const i of e.edges) w.slowEdges.set(i, Math.max(w.slowEdges.get(i) ?? 1, e.def.slow));
  w.stationTrees.clear();
  w.callTrees.clear();
  if (newDay) say(w, `Météo du ${dateText(t.date)} · ${bulletin(t)}`, 'info', true);
}

export const eventHours = (e: EventDef) => `${e.from % 24} h – ${e.to % 24} h`;

export function bulletin(t: Today): string {
  return [t.weather.bulletin, ...t.events.map((e) => `${e.def.label} (${eventHours(e.def)})`)].join(' · ');
}

/** How much more (or less) often this kind of call comes today, at this hour. */
export function callWeight(w: World, k: CallKind): number {
  const weather = today(w).weather;
  let f = weather.kinds[k.id] ?? weather.families[k.family] ?? 1;
  for (const e of activeEvents(w)) f *= e.def.kinds[k.id] ?? 1;
  return f;
}

export function rateFactor(w: World): number {
  return activeEvents(w).reduce((f, e) => f * e.def.rate, today(w).weather.rate);
}

/** Places the running events draw calls to. */
export function draws(w: World): Partial<Record<Place, number>> {
  const out: Partial<Record<Place, number>> = {};
  for (const e of activeEvents(w)) for (const [p, v] of Object.entries(e.def.draws)) out[p as Place] = (out[p as Place] ?? 0) + (v ?? 0);
  return out;
}
