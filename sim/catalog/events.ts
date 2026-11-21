// What happens in town on a given day: a match, the market, roadworks, the
// national holidays. Hours run on the shift clock: 7 to 31 (31 = 07:00 next morning).
import type { Place } from './places.ts';

export type EventId = 'match' | 'marche' | 'travaux' | 'quatorze' | 'musique' | 'nouvel_an';

export interface EventDef {
  id: EventId;
  label: string;
  icon: string;
  from: number;
  to: number;
  /** Whether it happens on this date (UTC fields) given a die roll. */
  when: (date: Date, roll: number) => boolean;
  /** Streets it slows: near this kind of place, all main roads, or a few random streets. */
  slows: Place | 'axes' | 'chantiers' | null;
  /** Multiplier on those streets' travel time while it lasts. */
  slow: number;
  rate: number;
  kinds: Record<string, number>;
  /** Calls drawn towards these places while it lasts. */
  draws: Partial<Record<Place, number>>;
}

const on = (month: number, day: number) => (d: Date) => d.getUTCMonth() === month && d.getUTCDate() === day;

export const EVENTS: EventDef[] = [
  {
    id: 'match', label: 'Match au stade', icon: 'e_match', from: 18, to: 23,
    when: (d, roll) => (d.getUTCDay() === 0 || d.getUTCDay() === 6) && roll < 0.6,
    slows: 'stade', slow: 1.9, rate: 1.1, kinds: { rixe: 3, malaise_vp: 1.5, vol: 1.5 }, draws: { stade: 6 },
  },
  {
    id: 'marche', label: 'Jour de marché', icon: 'e_marche', from: 7, to: 13,
    when: (d) => d.getUTCDay() === 3 || d.getUTCDay() === 6,
    slows: 'commercial', slow: 1.6, rate: 1, kinds: { chute: 1.5, vol: 2, malaise_vp: 1.3 }, draws: { commercial: 4 },
  },
  {
    id: 'travaux', label: 'Travaux de voirie', icon: 'e_travaux', from: 7, to: 19,
    when: (d, roll) => d.getUTCDay() !== 0 && roll < 0.35,
    slows: 'chantiers', slow: 4, rate: 1, kinds: { accident_travail: 1.5 }, draws: {},
  },
  {
    id: 'quatorze', label: 'Feu d\'artifice du 14 Juillet', icon: 'e_fete', from: 21, to: 27,
    when: on(6, 14), slows: 'axes', slow: 1.5, rate: 1.35,
    kinds: { rixe: 2.5, feu_poubelle: 3, feu_vegetation: 2.5, blesse_leger: 2.5, feu_vehicule: 2, malaise_vp: 1.5 }, draws: { parc: 3, eau: 3 },
  },
  {
    id: 'musique', label: 'Fête de la musique', icon: 'e_fete', from: 19, to: 28,
    when: on(5, 21), slows: 'axes', slow: 1.4, rate: 1.3, kinds: { rixe: 2.5, malaise_vp: 2, tapage: 3, blesse_leger: 1.5 }, draws: { bar: 4, commercial: 2 },
  },
  {
    id: 'nouvel_an', label: 'Nuit du Nouvel An', icon: 'e_fete', from: 21, to: 31,
    when: on(11, 31), slows: 'axes', slow: 1.3, rate: 1.4,
    kinds: { feu_vehicule: 4, feu_poubelle: 3, rixe: 2.5, malaise_vp: 2, avp: 1.5, tapage: 2 }, draws: { bar: 4 },
  },
];
