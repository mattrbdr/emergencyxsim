// The map's palette: an operations console at night — slate, no glow.
import type { Service } from '../sim/catalog/units.ts';
import { PALETTE } from './palette.ts';

export const MAP = {
  bg: PALETTE.bg,
  land: PALETTE.surface,
  water: '#13263a',
  waterEdge: '#1b3550',
  park: '#13201a',
  building: '#171c24',
  buildingEdge: '#1e2530',
  roads: ['#6b7686', '#525c6b', '#363e4a', '#2a313b'],
  /** Dark edge drawn under the main roads so they read as roads, not lines. */
  casing: '#0b0e12',
  /** Lit windows at night. */
  window: '#e8b866',
  label: '#768294',
  halo: PALETTE.bg,
  ink: PALETTE.ink,
  muted: '#8b949e',
};

export const SERVICE: Record<Service, string> = PALETTE.service;
export const PRIORITY = ['', PALETTE.priority[1], PALETTE.priority[2], PALETTE.priority[3]];
export const WORKING = PALETTE.working;
export const COVERAGE = { fast: PALETTE.service.samu, slow: PALETTE.priority[2], far: PALETTE.priority[1] };
export const ZONE_TINT: Record<string, string> = {
  industriel: 'rgba(180,142,240,0.08)', commercial: 'rgba(216,166,74,0.07)', parc: 'rgba(0,0,0,0)',
};

export const FONT = {
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  sans: "'IBM Plex Sans', -apple-system, system-ui, sans-serif",
};
