// The map's palette: an operations console at night — slate, no glow.
import type { Service } from '../sim/catalog/units.ts';

export const MAP = {
  bg: '#0b0e12',
  land: '#11151b',
  water: '#13263a',
  waterEdge: '#1b3550',
  park: '#13201a',
  building: '#171c24',
  buildingEdge: '#1e2530',
  roads: ['#4a5462', '#3b4451', '#2f3743', '#272e38'],
  label: '#768294',
  halo: '#0b0e12',
  ink: '#e6edf3',
  muted: '#8b949e',
};

export const SERVICE: Record<Service, string> = { pompiers: '#f2555a', samu: '#3fb950', police: '#4c8dff' };
export const PRIORITY = ['', '#f2555a', '#f0a531', '#c9b037'];
export const WORKING = '#56c2e6';

export const FONT = {
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  sans: "'IBM Plex Sans', -apple-system, system-ui, sans-serif",
};
