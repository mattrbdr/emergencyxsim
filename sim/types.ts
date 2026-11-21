// The game state. Every module of sim/ reads and writes this one shape.
import type { BuildingKind } from './catalog/buildings.ts';
import type { CallKind } from './catalog/calls.ts';
import type { Service, UnitType } from './catalog/units.ts';
import type { City } from './city.ts';
import type { Rng } from './rng.ts';
import type { Tree } from './routing.ts';
import type { Contract, DayStats } from './contracts.ts';
import type { Major, MajorReport } from './majors.ts';
import type { Today } from './weather.ts';

export type UnitStatus = 'dispo' | 'route' | 'surplace' | 'transport' | 'hopital' | 'retour';

export interface Building {
  id: string;
  kind: BuildingKind;
  name: string;
  node: number;
  x: number;
  y: number;
  slots: number;
  /** Index of the real site it took over, or -1 when built on a plot. */
  site: number;
  patients: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  service: Service;
  name: string;
  building: string;
  home: number;
  /** Nodes still to drive; path[0] is the node the unit left (or stands on). */
  path: number[];
  along: number;
  /** Straight-line flight (helicopter): target point, or null on the road. */
  flight: { x: number; y: number } | null;
  x: number;
  y: number;
  px: number;
  py: number;
  heading: number;
  status: UnitStatus;
  callId: string;
  wait: number;
  missions: number;
}

export type CallState = 'nouveau' | 'attente' | 'engage' | 'bilan' | 'traitement' | 'clos';
export type Outcome = '' | 'sauve' | 'perdu' | 'echec';

export interface Call {
  id: string;
  kind: CallKind;
  node: number;
  x: number;
  y: number;
  /** Full address for the call sheet (landmark, floor, door code). */
  address: string;
  /** Number and street only, for the log. */
  street: string;
  caller: string;
  at: number;
  deadline: number;
  priority: number;
  state: CallState;
  qualified: boolean;
  guessedRight: boolean;
  needs: UnitType[];
  assigned: string[];
  workLeft: number;
  escalated: boolean;
  outcome: Outcome;
  firstOnScene: number;
  closedAt: number;
  earned: number;
  /** The first crew's report was rolled (sim/scenes.ts). */
  twistRolled: boolean;
  /** A report waiting for the player's decision. */
  twist: { id: string; report: string; add: UnitType[]; from: string } | null;
  decisionLeft: number;
  /** Chance the intervention succeeds (1 unless the player took a risk). */
  risk: number;
  /** Reward multiplier earned by the decision. */
  bonus: number;
  /** Work may not start yet (a vehicle on the run is not stopped). */
  hold: boolean;
  /** The major incident this call is a phase of ('' for an everyday call). */
  majorId: string;
  /** A command decision asked by a major incident's phase. */
  prompt: { from: string; report: string; options: MajorChoice[] } | null;
}

export interface MajorChoice {
  id: string;
  label: string;
  detail: string;
  needs: UnitType[];
  work: number;
  success: number;
  bonus: number;
  injuredOnFail: number;
}

export interface LogEntry {
  id: number;
  t: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'alert' | 'money';
}

export interface Stats {
  calls: number;
  saved: number;
  lost: number;
  failed: number;
  earned: number;
  spent: number;
  responseSum: number;
  responses: number;
  qualifyRight: number;
  qualifyWrong: number;
}

export interface Pointer { x: number; y: number; sx: number; sy: number; moved: boolean }

export interface Camera {
  cx: number; cy: number; zoom: number;
  tx: number; ty: number; tz: number;
  seq: number;
  touched: boolean;
}

export interface World {
  city: City;
  seed: number;
  rng: Rng;
  /** Game seconds since the career began. */
  t: number;
  speed: number;
  paused: boolean;
  seq: number;
  money: number;
  xp: number;
  level: number;
  /** Highest level whose unlock card the player has seen. */
  seenLevel: number;
  reputation: number;
  buildings: Building[];
  units: Unit[];
  calls: Call[];
  nextCallAt: number;
  nextId: number;
  stats: Stats;
  log: LogEntry[];
  toast: LogEntry;
  logId: number;
  /** Dirty since the last save. */
  dirty: boolean;
  stationTrees: Map<number, Tree>;
  callTrees: Map<string, Tree>;
  cam: Camera;
  view: { w: number; h: number };
  pointers: Map<number, Pointer>;
  pinch: { d: number; zoom: number } | null;
  /** Build mode: the kind being placed and where the ghost stands (node, or -1). */
  placing: { kind: BuildingKind; node: number; gain: number; after: number } | null;
  /** The coverage overlay is shown on the map. */
  overlay: boolean;
  contracts: Contract[];
  dayStats: DayStats;
  /** Days in a row with every contract done. */
  streak: number;
  /** Index of the current tutorial step (STEPS.length when finished). */
  tutorial: number;
  tip: string;
  tipsSeen: string[];
  majors: Major[];
  nextMajorAt: number;
  /** The last incident's summary, until the player closes it. */
  majorReport: MajorReport | null;
  /** Streets cut (flooded): routing goes around them. */
  blocked: Set<number>;
  /** Midnight (UTC) of the career's first day, for the calendar. */
  startDate: number;
  /** The day's weather and events (worked out from the seed, not saved). */
  today: Today | null;
  conditionsKey: string;
  /** Today's weather slowdown on every street, and the streets an event slows. */
  trafficMul: number;
  slowEdges: Map<number, number>;
}
