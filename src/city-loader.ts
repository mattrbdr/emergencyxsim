// Downloading the player's town from OpenStreetMap, in the data module.
// Progress is kept here and read by the view through the `cityStatus` source.
import { convert } from '../sim/osm/convert.ts';
import { areasQuery, OVERPASS, parseSearch, roadsQuery, searchQuery, type CommuneMatch } from '../sim/osm/query.ts';
import type { CityFile } from '../sim/city.ts';

export const NET_GRANT = `net.fetch ${new URL(OVERPASS).origin}`;

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

async function overpass(query: string, maxBytes: number) {
  const init: RequestInit & Record<string, unknown> = {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    exactTimeout: 200000,
    exactIndependentHttp: { maxResponseBytes: maxBytes },
  };
  let res: Response;
  try {
    res = await fetch(OVERPASS, init);
  } catch {
    throw new Error('Pas de connexion au serveur OpenStreetMap. Vérifiez votre réseau.');
  }
  if (res.status === 429 || res.status === 504) throw new Error('Le serveur OpenStreetMap est saturé. Réessayez dans une minute.');
  if (!res.ok) throw new Error(`OpenStreetMap a répondu ${res.status}.`);
  return (await res.json()) as { elements: any[] };
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
  } catch (e: any) {
    set('error', e.message);
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
  } catch (e: any) {
    set('error', e.message ?? String(e));
    return null;
  }
}
