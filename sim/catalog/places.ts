// Where calls happen: districts (zones) and sensitive places (hotspots) of the
// town, and how much each kind of call is drawn to them.

export type ZoneKind = 'industriel' | 'commercial' | 'parc';
export type HotspotKind = 'bar' | 'ecole' | 'stade' | 'ehpad' | 'gare';
/** 'axe': a main road; 'eau': a street along a river, a lake or the sea. */
export type Place = ZoneKind | HotspotKind | 'axe' | 'eau';

export const ZONE_LABEL: Record<ZoneKind, string> = {
  industriel: 'Zone industrielle', commercial: 'Zone commerciale', parc: 'Parc',
};
export const HOTSPOT_LABEL: Record<HotspotKind, string> = {
  bar: 'Bar', ecole: 'École', stade: 'Stade', ehpad: 'EHPAD', gare: 'Gare',
};

/** Extra weight a call kind gets on a street near / inside each place. */
export const AFFINITY: Record<string, Partial<Record<Place, number>>> = {
  malaise_vp: { gare: 2, commercial: 1.5 },
  chute: { ehpad: 5 },
  blesse_leger: { ecole: 2, parc: 1 },
  feu_vehicule: { axe: 1, commercial: 1 },
  alarme: { ecole: 3, commercial: 2, industriel: 2 },
  feu_vegetation: { parc: 4 },
  tapage: { bar: 5 },
  animal: { parc: 2 },
  avp: { axe: 3 },
  avp_2roues: { axe: 2 },
  transport: { ehpad: 4 },
  accident_travail: { industriel: 5 },
  rixe: { bar: 5, stade: 3, gare: 2 },
  vol: { gare: 3, commercial: 3 },
  braquage: { commercial: 4 },
  feu_entrepot: { industriel: 6 },
  feu_industriel: { industriel: 8 },
  noyade: { eau: 6, parc: 2 },
  rodeo: { parc: 2, axe: 1 },
  delit_fuite: { axe: 3 },
  avp_bouchon: { axe: 5 },
  grue: { industriel: 3, commercial: 2 },
  puits: { parc: 2, industriel: 2 },
  suicidaire: { gare: 2, commercial: 1, eau: 2 },
  personne_eau: { eau: 8 },
  voiture_eau: { eau: 8 },
  bateau: { eau: 10 },
  disparition: { ehpad: 4, parc: 2 },
  stups: { gare: 3, bar: 2 },
  feu_citerne: { axe: 3, industriel: 3 },
  feu_station: { axe: 2, commercial: 2 },
  egare: { parc: 6, eau: 2 },
  forcene: { bar: 1 },
  nourrisson: { ecole: 1 },
  avp_isole: { axe: 4 },
  accident_car: { axe: 4, ecole: 2 },
  plan_rouge: { stade: 6 },
};

/** Hotspots count within this many metres of a street. */
export const HOTSPOT_RADIUS = 300;
