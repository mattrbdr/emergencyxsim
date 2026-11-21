// Awarding achievements, and the records some of them follow across days.
import { ACHIEVEMENTS } from './catalog/achievements.ts';
import type { DayStats } from './contracts.ts';
import { earn } from './economy.ts';
import { euros, say } from './log.ts';
import { gainXp } from './progression.ts';
import type { World } from './types.ts';
import { conditionsOn } from './weather.ts';

export interface Records {
  qualifyRun: number;
  bestQualifyRun: number;
  /** Days of at least 10 interventions without a death. */
  cleanDays: number;
  /** Days of at least 10 interventions with an average arrival under 6 min. */
  fastDays: number;
  /** Snow days of at least 10 interventions without a failure. */
  snowClean: number;
  lastBreakdownDay: number;
  /** Kinds of crisis won at least once (kept across reloads, unlike w.majors). */
  crisesWon: string[];
}

export const emptyRecords = (): Records => ({ qualifyRun: 0, bestQualifyRun: 0, cleanDays: 0, fastDays: 0, snowClean: 0, lastBreakdownDay: 1, crisesWon: [] });

/** Pays and announces every achievement just reached. */
export function checkAchievements(w: World) {
  for (const a of ACHIEVEMENTS) {
    if (w.achievements.includes(a.id)) continue;
    const [value, target] = a.goal(w);
    if (value < target) continue;
    w.achievements.push(a.id);
    if (a.money) earn(w, a.money);
    if (a.xp) gainXp(w, a.xp);
    say(w, `Succès · ${a.title}${a.money ? ` · +${euros(a.money)}` : ''}`, 'good', true);
    w.dirty = true;
  }
}

export function noteQualification(w: World, right: boolean) {
  w.records.qualifyRun = right ? w.records.qualifyRun + 1 : 0;
  w.records.bestQualifyRun = Math.max(w.records.bestQualifyRun, w.records.qualifyRun);
}

/** At 07:00, the day that ends is weighed for the records. */
export function closeDay(w: World, d: DayStats) {
  const done = d.responses.length;
  if (done < 10) return;
  if (d.lost === 0) w.records.cleanDays++;
  if (d.responses.reduce((s, r) => s + r.seconds, 0) / done < 6 * 60) w.records.fastDays++;
  if (conditionsOn(w, d.day).weather.id === 'neige' && d.failed === 0) w.records.snowClean++;
}
