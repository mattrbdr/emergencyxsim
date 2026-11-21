// The day's weather: how it slows the roads and which calls it brings.
import type { Family } from './calls.ts';

export type WeatherId = 'beau' | 'pluie' | 'orage' | 'canicule' | 'neige';

export interface WeatherDef {
  id: WeatherId;
  label: string;
  /** For the day's bulletin. */
  bulletin: string;
  icon: string;
  /** Multiplier on every street's travel time. */
  traffic: number;
  /** Multiplier on the number of calls. */
  rate: number;
  families: Partial<Record<Family, number>>;
  kinds: Record<string, number>;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  beau: { id: 'beau', label: 'Beau temps', bulletin: 'Temps sec et dégagé', icon: 'w_beau', traffic: 1, rate: 1, families: {}, kinds: {} },
  pluie: {
    id: 'pluie', label: 'Pluie', bulletin: 'Pluie toute la journée, chaussées glissantes', icon: 'w_pluie', traffic: 1.15, rate: 1.05,
    families: { route: 1.6 }, kinds: { chute: 1.3, feu_vegetation: 0.2, rodeo: 0.3 },
  },
  orage: {
    id: 'orage', label: 'Orage', bulletin: 'Orages violents, risque d\'inondations', icon: 'w_orage', traffic: 1.3, rate: 1.1,
    families: { route: 1.4 }, kinds: { inondation: 4, ascenseur: 1.8, feu_appart: 1.3, alarme: 2, feu_vegetation: 0.4, bateau: 2 },
  },
  canicule: {
    id: 'canicule', label: 'Canicule', bulletin: 'Canicule, vigilance orange', icon: 'w_canicule', traffic: 1, rate: 1.1,
    families: {}, kinds: { malaise_vp: 2.2, malaise_domicile: 1.8, detresse: 1.4, feu_vegetation: 3, noyade: 3, personne_eau: 2.5, rixe: 1.3, transport: 1.3 },
  },
  neige: {
    id: 'neige', label: 'Neige', bulletin: 'Neige et verglas, circulation très difficile', icon: 'w_neige', traffic: 1.6, rate: 1.15,
    families: { route: 2.2 }, kinds: { chute: 2.6, intox_co: 2.5, malaise_vp: 1.3, feu_vegetation: 0, rodeo: 0, noyade: 0 },
  },
};

/** Odds of each weather by season (month 0 = January). */
export function weatherOdds(month: number): [WeatherId, number][] {
  if (month === 11 || month <= 1) return [['beau', 0.45], ['pluie', 0.3], ['neige', 0.25]];
  if (month <= 4) return [['beau', 0.55], ['pluie', 0.35], ['orage', 0.1]];
  if (month <= 7) return [['beau', 0.55], ['pluie', 0.1], ['orage', 0.15], ['canicule', 0.2]];
  return [['beau', 0.45], ['pluie', 0.45], ['orage', 0.1]];
}
