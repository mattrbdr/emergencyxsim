// Downloading the player's town from OpenStreetMap, in the data module.
// Progress is kept here and read by the view through the `cityStatus` source.
import { convert } from '../sim/osm/convert.ts';
import { areasQuery, OVERPASS_ENDPOINTS, parseSearch, roadsQuery, searchQuery, type CommuneMatch } from '../sim/osm/query.ts';
import type { CityFile } from '../sim/city.ts';
import type { OsmResponse } from '../sim/osm/types.ts';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));


export type Phase = 'idle' | 'search' | 'roads' | 'areas' | 'build' | 'done' | 'error';

export const status = { phase: 'idle' as Phase, message: '', matches: [] as CommuneMatch[] };

const PHASE_TEXT: Record<Phase, string> = {
  idle: '', search: 'Recherche de la commune…', roads: 'Téléchargement des rues et des bases…',
  areas: 'Téléchargement des bâtiments et des cours d\'eau…', build: 'Construction du réseau routier…',
  done: 'Ville prête.', error: '',
};

function set(phase: Phase, message = PHASE_TEXT[phase]) {
  status.phase = phase;
  status.message = message;
}

declare const scheduler: { yield(): Promise<void> };
const pause = () => (typeof scheduler !== 'undefined' ? scheduler.yield() : Promise.resolve());

/** Asks the main server, then each mirror, until one answers. */
async function overpass(query: string, maxBytes: number): Promise<OsmResponse> {
  let last = 'Pas de connexion au serveur OpenStreetMap. Vérifiez votre réseau.';
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const init: RequestInit & Record<string, unknown> = {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      exactTimeout: 200000,
      exactIndependentHttp: { maxResponseBytes: maxBytes },
    };
    let res: Response;
    try {
      res = await fetch(endpoint, init);
    } catch {
      continue;
    }
    if (res.ok) return (await res.json()) as OsmResponse;
    last = res.status === 429 || res.status === 504
      ? 'Les serveurs OpenStreetMap sont saturés. Réessayez dans une minute.'
      : `OpenStreetMap a répondu ${res.status}.`;
  }
  throw new Error(last);
}

export async function searchCommune(name: string): Promise<CommuneMatch[]> {
  if (name.trim().length < 2) {
    set('error', 'Tapez au moins deux lettres.');
    return [];
  }
  set('search');
  try {
    status.matches = parseSearch(await overpass(searchQuery(name), 1 << 20));
    set('idle', status.matches.length === 0 ? `Aucune commune française nommée « ${name.trim()} ».` : '');
  } catch (e) {
    set('error', messageOf(e));
    status.matches = [];
  }
  return status.matches;
}

/** Downloads and converts a commune; null when it failed (status says why). */
export async function downloadCommune(insee: string, name: string): Promise<CityFile | null> {
  try {
    set('roads');
    const roads = await overpass(roadsQuery(insee), 48 << 20);
    set('areas');
    const areas = await overpass(areasQuery(insee, 20000), 32 << 20).catch(() => null); // the map still works without them
    set('build');
    const city = await convert(roads, areas, name, pause);
    if (city.edges.length < 40) throw new Error('Trop peu de routes dans cette commune pour jouer.');
    set('done');
    return city;
  } catch (e) {
    set('error', messageOf(e));
    return null;
  }
}
