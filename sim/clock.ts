// Game time: the career starts on day 1 at 07:00; 1 real second is 15 game seconds at ×1.
export const TIME_SCALE = 15;
export const DAY_START = 7 * 3600;

const pad = (n: number) => String(n).padStart(2, '0');

export const secondOfDay = (t: number) => Math.floor(DAY_START + t) % 86400;
export const hourOf = (t: number) => secondOfDay(t) / 3600;
export const dayOf = (t: number) => 1 + Math.floor((DAY_START + t) / 86400);
export const clockText = (t: number) => {
  const s = secondOfDay(t);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`;
};
export const minutesText = (s: number) => {
  const m = Math.max(0, Math.round(s / 60));
  return m < 1 ? '< 1 min' : `${m} min`;
};
