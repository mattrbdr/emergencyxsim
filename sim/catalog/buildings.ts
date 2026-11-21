// Stations the player builds (anywhere on a road) or buys (a real site from the map).
import type { PoiKind } from '../city.ts';
import type { Service } from './units.ts';

export type BuildingKind = 'caserne' | 'police' | 'hopital';

export interface BuildingDef {
  kind: BuildingKind;
  service: Service;
  label: string;
  level: number;
  /** Price to build on an empty plot. */
  build: number;
  /** Price to take over a real site from OpenStreetMap. */
  buy: number;
  slots: number;
  maxSlots: number;
  /** Price of each extension (+2 slots). */
  expand: number;
  /** Euros per game hour. */
  upkeep: number;
  beds: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  caserne: { kind: 'caserne', service: 'pompiers', label: 'Caserne', level: 1, build: 40000, buy: 26000, slots: 2, maxSlots: 8, expand: 15000, upkeep: 120, beds: 0 },
  police: { kind: 'police', service: 'police', label: 'Poste de police', level: 3, build: 45000, buy: 30000, slots: 2, maxSlots: 6, expand: 14000, upkeep: 110, beds: 0 },
  hopital: { kind: 'hopital', service: 'samu', label: 'Hôpital', level: 5, build: 120000, buy: 80000, slots: 2, maxSlots: 6, expand: 30000, upkeep: 300, beds: 8 },
};

export const BUILDING_ORDER: BuildingKind[] = ['caserne', 'police', 'hopital'];

export const KIND_OF_POI: Record<PoiKind, BuildingKind> = { fire: 'caserne', police: 'police', hospital: 'hopital' };
