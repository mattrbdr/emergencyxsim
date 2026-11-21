// Daily contracts: three goals each game day (from 07:00 to 07:00), with a bonus,
// and a streak of perfect days that raises every contract's reward.
import type { Family } from './catalog/calls.ts';
import { FAMILY_LABEL } from './catalog/calls.ts';
import { UNITS } from './catalog/units.ts';
import { hourOf } from './clock.ts';
import { coverageShare } from './coverage.ts';
import { euros, say } from './log.ts';
import { gainXp } from './progression.ts';
import type { Call, World } from './types.ts';

export type ContractKind = 'fast' | 'no_loss' | 'coverage' | 'qualify' | 'family' | 'earn';

export interface Contract {
  id: string;
  kind: ContractKind;
  label: string;
  target: number;
  progress: number;
  family: Family | '';
  /** Minutes, for "fast" contracts. */
  minutes: number;
  reward: number;
  xp: number;
  state: 'open' | 'done' | 'failed';
}

/** What happened today, enough to grade every contract. */
export interface DayStats {
  day: number;
  /** Response times (s) by family, for closed successful calls. */
  responses: { family: Family; seconds: number }[];
  saved: number;
  lost: number;
  qualifyRight: number;
  earned: number;
  done: Partial<Record<Family, number>>;
}

export const emptyDay = (day: number): DayStats => ({ day, responses: [], saved: 0, lost: 0, qualifyRight: 0, earned: 0, done: {} });

/** Families the fleet can actually answer. */
function families(w: World): Family[] {
  const owned = new Set(w.units.map((u) => UNITS[u.type].service));
  const out: Family[] = ['sap'];
  if (w.units.some((u) => u.type === 'FPT')) out.push('feu');
  if (owned.has('police')) out.push('police');
  if (w.units.some((u) => u.type === 'VSR')) out.push('route');
  if (w.units.some((u) => u.type === 'VTU')) out.push('technique');
  return out;
}

function make(w: World, kind: ContractKind): Contract {
  const fleet = Math.max(1, w.units.length);
  const scale = 1 + (w.level - 1) * 0.15;
  const base = { id: `k${w.nextId++}`, kind, progress: 0, family: '' as Family | '', minutes: 0, state: 'open' as const };
  const fams = families(w);
  switch (kind) {
    case 'fast': {
      const family = fams[Math.floor(w.rng() * fams.length)];
      const target = Math.max(2, Math.round(fleet * 0.8));
      return { ...base, kind, family, minutes: 6, target, label: `${target} ${FAMILY_LABEL[family].toLowerCase()} avec arrivée en moins de 6 min`, reward: Math.round(900 * target * scale / 50) * 50, xp: 25 * target };
    }
    case 'no_loss':
      return { ...base, kind, target: 1, label: 'Aucune victime perdue avant 19:00', reward: Math.round(4000 * scale / 50) * 50, xp: 90 };
    case 'coverage': {
      // Always a step up from today's coverage.
      const now = Math.round(coverageShare(w) * 100);
      const target = Math.min(95, Math.ceil((now + 12) / 5) * 5);
      if (now >= 90) return make(w, 'qualify');
      return { ...base, kind, target, label: `Couvrir ${target} % de la ville en moins de 3 min`, reward: Math.round(3000 * scale / 50) * 50, xp: 70 };
    }
    case 'qualify': {
      const target = Math.max(4, Math.round(fleet * 1.5));
      return { ...base, kind, target, label: `Qualifier correctement ${target} appels`, reward: Math.round(250 * target * scale / 50) * 50, xp: 8 * target };
    }
    case 'family': {
      const family = fams[Math.floor(w.rng() * fams.length)];
      const target = Math.max(3, Math.round(fleet));
      return { ...base, kind, family, target, label: `Réussir ${target} interventions : ${FAMILY_LABEL[family].toLowerCase()}`, reward: Math.round(700 * target * scale / 50) * 50, xp: 20 * target };
    }
    case 'earn': {
      const target = Math.round((4000 + fleet * 2500) * scale / 500) * 500;
      return { ...base, kind, target, label: `Encaisser ${euros(target)} de primes`, reward: Math.round(target * 0.25 / 50) * 50, xp: 80 };
    }
  }
}

/** The contract day: the career starts at 07:00, so day n runs from 07:00 to 07:00. */
export const shiftDay = (w: World) => 1 + Math.floor(w.t / 86400);

/** Three new contracts for the day that starts. */
export function newDay(w: World) {
  const day = shiftDay(w);
  const finished = w.contracts.filter((c) => c.state === 'done').length;
  if (w.contracts.length > 0) {
    if (finished === w.contracts.length) w.streak++;
    else w.streak = 0;
  }
  w.dayStats = emptyDay(day);
  const pool: ContractKind[] = ['fast', 'no_loss', 'coverage', 'qualify', 'family', 'earn'];
  const chosen: ContractKind[] = [];
  while (chosen.length < 3) {
    const k = pool[Math.floor(w.rng() * pool.length)];
    if (!chosen.includes(k)) chosen.push(k);
  }
  w.contracts = chosen.map((k) => make(w, k));
  say(w, `Jour ${day} : trois nouveaux contrats${w.streak > 0 ? ` (série de ${w.streak} jour${w.streak > 1 ? 's' : ''} parfaits, primes +${Math.min(5, w.streak) * 10} %)` : ''}.`, 'info', true);
  w.dirty = true;
}

/** Records a closed call for today's contracts. */
export function recordCall(w: World, call: Call) {
  const d = w.dayStats;
  if (call.outcome === 'sauve') {
    d.done[call.kind.family] = (d.done[call.kind.family] ?? 0) + 1;
    if (call.firstOnScene >= 0) d.responses.push({ family: call.kind.family, seconds: call.firstOnScene - call.at });
    d.saved += call.kind.victims;
  } else if (call.outcome === 'perdu') {
    d.lost += call.kind.victims;
  }
}

export const streakBonus = (w: World) => 1 + Math.min(5, w.streak) * 0.1;

/** Grades every open contract; pays those just completed. */
export function updateContracts(w: World) {
  if (w.buildings.length === 0) return;
  if (w.contracts.length === 0 || shiftDay(w) !== w.dayStats.day) newDay(w);
  const d = w.dayStats;
  for (const c of w.contracts) {
    if (c.state !== 'open') continue;
    switch (c.kind) {
      case 'fast': c.progress = d.responses.filter((r) => r.family === c.family && r.seconds <= c.minutes * 60).length; break;
      case 'no_loss':
        if (d.lost > 0) c.state = 'failed';
        else if (hourOf(w.t) >= 19 || hourOf(w.t) < 7) c.progress = 1;
        break;
      case 'coverage': c.progress = Math.round(coverageShare(w) * 100); break;
      case 'qualify': c.progress = d.qualifyRight; break;
      case 'family': c.progress = d.done[c.family as Family] ?? 0; break;
      case 'earn': c.progress = d.earned; break;
    }
    if (c.state === 'open' && c.progress >= c.target) {
      c.state = 'done';
      const money = Math.round(c.reward * streakBonus(w));
      w.money += money; // not counted in today's "earn" contract
      w.stats.earned += money;
      gainXp(w, c.xp);
      say(w, `Contrat rempli : ${c.label} (+${euros(money)}, +${c.xp} XP).`, 'money', true);
    }
  }
  if (w.contracts.length > 0 && w.contracts.every((c) => c.state !== 'open')) w.dirty = true;
}
