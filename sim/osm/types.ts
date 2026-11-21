// The parts of an Overpass JSON answer the game reads.
export interface OsmGeo { lat: number; lon: number }
export type OsmTags = Record<string, string>;

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: OsmGeo;
  nodes?: number[];
  geometry?: OsmGeo[];
  members?: { role: string; geometry?: OsmGeo[] }[];
  tags?: OsmTags;
}

export interface OsmResponse { elements: OsmElement[] }
