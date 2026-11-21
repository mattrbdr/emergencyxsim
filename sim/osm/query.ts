// Overpass queries for a French commune: finding it by name, then its roads,
// stations and (in a second, bounded request) its buildings, water and parks.
import type { OsmResponse } from './types.ts';

export const OVERPASS = 'https://overpass-api.de/api/interpreter';

export const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';

const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Communes of France whose name is `name` (case-insensitive), with their INSEE code. */
export const searchQuery = (name: string) => `[out:json][timeout:60];
area["ISO3166-1"="FR"]["admin_level"="2"]->.fr;
rel(area.fr)["boundary"="administrative"]["admin_level"="8"]["name"~"^${quote(escapeRegex(name.trim()))}$",i];
out tags 20;`;

const area = (insee: string) => `area["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"="${quote(insee)}"]->.a;`;

/** Roads (with node ids for the graph) and emergency stations. */
export const roadsQuery = (insee: string) => `[out:json][timeout:180];
${area(insee)}
way["highway"~"^(${ROAD_CLASSES})$"](area.a)->.roads;
.roads out body;
.roads >;
out skel qt;
nwr["amenity"~"^(fire_station|hospital|police)$"](area.a);
out center tags;
(
  nwr["amenity"~"^(bar|pub|nightclub|school|nursing_home)$"](area.a);
  nwr["social_facility"="nursing_home"](area.a);
  nwr["leisure"="stadium"](area.a);
  nwr["railway"="station"](area.a);
);
out center tags 800;
rel["boundary"="administrative"]["admin_level"="8"]["ref:INSEE"="${quote(insee)}"];
out tags;`;

/** Buildings, water and parks, as geometry only, capped so a big city stays in memory. */
export const areasQuery = (insee: string, maxBuildings: number) => `[out:json][timeout:180];
${area(insee)}
(
  way["natural"="water"](area.a);
  way["waterway"="riverbank"](area.a);
  relation["natural"="water"](area.a);
  way["waterway"~"^(river|canal)$"](area.a);
  way["leisure"~"^(park|garden)$"](area.a);
  way["landuse"~"^(grass|forest|recreation_ground|cemetery)$"](area.a);
  way["landuse"~"^(industrial|commercial|retail)$"](area.a);
);
out geom qt;
way["building"](area.a);
out skel geom qt ${maxBuildings};`;

export interface CommuneMatch {
  insee: string;
  name: string;
  department: string;
  population: number;
}

export function parseSearch(json: OsmResponse): CommuneMatch[] {
  return json.elements
    .flatMap((e) => (e.tags?.['ref:INSEE'] ? [e.tags] : []))
    .map((tags) => {
      const insee = tags['ref:INSEE'];
      return {
        insee,
        name: tags.name ?? insee,
        department: insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2),
        population: Number(tags.population ?? 0) || 0,
      };
    })
    .sort((a, b) => b.population - a.population);
}
