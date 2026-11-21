// The map's palette: an operations console at night — slate, no glow.
import type { Service } from '../sim/catalog/units.ts';
import { PALETTE } from './palette.ts';

export const MAP = {
  bg: PALETTE.bg,
  land: '#11151b',
  water: '#13263a',
  waterEdge: '#1b3550',
  park: '#13201a',
  building: '#171c24',
  buildingEdge: '#1e2530',
  roads: ['#4a5462', '#3b4451', '#2f3743', '#272e38'],
  label: '#768294',
  halo: '#0b0e12',
  ink: PALETTE.ink,
  muted: '#8b949e',
};

export const SERVICE: Record<Service, string> = PALETTE.service;
export const PRIORITY = ['', PALETTE.priority[1], PALETTE.priority[2], PALETTE.priority[3]];
export const WORKING = PALETTE.working;
export const COVERAGE = { fast: '#3fb950', slow: '#f0a531', far: '#f2555a' };
export const ZONE_TINT: Record<string, string> = {
  industriel: 'rgba(180,142,240,0.08)', commercial: 'rgba(216,166,74,0.07)', parc: 'rgba(0,0,0,0)',
};

export const FONT = {
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  sans: "'IBM Plex Sans', -apple-system, system-ui, sans-serif",
};
