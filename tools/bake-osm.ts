// Bakes a French commune from OpenStreetMap into data/city.json (the city shipped
// with the game; players download their own town in-game the same way).
//
//   bun tools/bake-osm.ts "Annecy"            the largest commune of that name
//   bun tools/bake-osm.ts --insee 74010       an exact commune
//
// Data © OpenStreetMap contributors, ODbL. Needs network access to overpass-api.de.
import { convert } from '../sim/osm/convert.ts';
import type { OsmResponse } from '../sim/osm/types.ts';
import { areasQuery, OVERPASS_ENDPOINTS, parseSearch, roadsQuery, searchQuery } from '../sim/osm/query.ts';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const name = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const endpoints = opt('endpoint') ? [opt('endpoint')!] : OVERPASS_ENDPOINTS;
const maxBuildings = Number(opt('max-buildings') ?? 30000);

async function overpass(query: string) {
  let last = '';
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'emergencyxsim-bake/2.0' },
        body: new URLSearchParams({ data: query }),
      });
      if (res.ok) return res.json() as Promise<OsmResponse>;
      last = `${endpoint} : ${res.status}`;
    } catch (e) {
      last = `${endpoint} : ${e instanceof Error ? e.message : e}`;
    }
    console.log(`  échec, essai suivant (${last})`);
  }
  throw new Error(`Aucun serveur Overpass n'a répondu (${last})`);
}

let insee = opt('insee');
if (!insee) {
  if (!name) {
    console.error('usage: bun tools/bake-osm.ts "<Commune>" | --insee <code>');
    process.exit(1);
  }
  const matches = parseSearch(await overpass(searchQuery(name)));
  if (matches.length === 0) { console.error(`Aucune commune « ${name} ».`); process.exit(1); }
  for (const m of matches) console.log(`  ${m.insee}  ${m.name} (${m.department})${m.population ? `  ${m.population} hab.` : ''}`);
  insee = matches[0].insee;
}
console.log(`Routes et bases de ${insee}…`);
const roads = await overpass(roadsQuery(insee));
console.log('Bâtiments, eau, parcs…');
const areas = await overpass(areasQuery(insee, maxBuildings));
const city = await convert(roads, areas, name ?? insee);
const out = new URL('../data/city.json', import.meta.url);
await Bun.write(out, JSON.stringify(city));
console.log(`data/city.json : ${city.name}, ${(city.width / 1000).toFixed(1)} × ${(city.height / 1000).toFixed(1)} km, ${city.edges.length / 4} tronçons, ${city.buildings.length} bâtiments, ${city.pois.length} bases — ${((await Bun.file(out).size) / 1e6).toFixed(1)} Mo`);
