import type { LogEntry, World } from './types.ts';

/** A line in the log; `toast` also shows it over the map. */
export function say(w: World, text: string, tone: LogEntry['tone'], toast = false) {
  const entry = { id: ++w.logId, t: w.t, text, tone };
  w.log.unshift(entry);
  if (w.log.length > 80) w.log.pop();
  if (toast) w.toast = entry;
}

/** 12 500 € (grouped by hand: native hosts may lack Intl). */
export const euros = (n: number) => {
  const sign = n < 0 ? '−' : '';
  const digits = String(Math.abs(Math.round(n)));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
};
