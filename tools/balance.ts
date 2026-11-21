// The balance bench: simulated careers, a careful player and a sloppy one, over
// several seeds; prints a table per game day and writes tools/out/balance.html.
//   bun tools/balance.ts [days=10] [seeds=4]
import cityFile from '../data/city.json';
import { FAMILIES } from '../sim/catalog/calls.ts';
import { loadCity, type CityFile } from '../sim/city.ts';
import { buildAt } from '../sim/buildings.ts';
import { dispatch, options, qualify } from '../sim/calls.ts';
import { upkeepPerHour } from '../sim/economy.ts';
import type { World } from '../sim/types.ts';
import { newWorld, tick } from '../sim/world.ts';
import { care, manage, regulate } from './players.ts';

const city = loadCity(cityFile as unknown as CityFile);
const days = Number(process.argv[2] ?? 10);
const seeds = Number(process.argv[3] ?? 4);

/** Slow and approximate: looks at the queue every 3 minutes, qualifies wrong one time in three. */
function sloppy(w: World) {
  for (const c of w.calls) {
    if (c.state === 'clos') continue;
    if (!c.qualified) qualify(w, c.id, w.rng() < 0.33 ? FAMILIES[Math.floor(w.rng() * FAMILIES.length)].id : c.kind.family);
    const picks = options(w, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
    if (picks.length) dispatch(w, c.id, picks);
  }
}

export interface DayRow { day: number; level: number; money: number; reputation: number; upkeep: number; response: number; saved: number; lost: number }

export async function career(seed: number, player: 'soigneux' | 'brouillon', nDays = days): Promise<DayRow[]> {
  const w = newWorld(city, seed);
  buildAt(w, 'caserne', city.width / 2, city.height / 2);
  w.speed = 4;
  const rows: DayRow[] = [];
  let day = 0;
  while (w.t < nDays * 86400) {
    tick(w, 250);
    const careful = player === 'soigneux';
    if (careful) regulate(w);
    else if (Math.floor(w.t) % 180 < 60) sloppy(w);
    if (Math.floor(w.t) % (careful ? 600 : 1800) < 60) { manage(w); if (careful) await care(w, true); }
    if (Math.floor(w.t / 86400) > day) {
      day = Math.floor(w.t / 86400);
      rows.push({
        day, level: w.level, money: Math.round(w.money), reputation: Math.round(w.reputation), upkeep: Math.round(upkeepPerHour(w)),
        response: w.stats.responses ? Math.round(w.stats.responseSum / w.stats.responses / 6) / 10 : 0,
        saved: w.stats.saved, lost: w.stats.lost,
      });
    }
  }
  return rows;
}

if (import.meta.main) {
  const out: Record<string, DayRow[][]> = { soigneux: [], brouillon: [] };
  for (const player of ['soigneux', 'brouillon'] as const) {
    for (let s = 1; s <= seeds; s++) out[player].push(await career(s * 101, player));
    console.log(`\n${player} (moyenne de ${seeds} carrières)`);
    console.log('jour  niveau   caisse   entretien/h  réputation  délai(min)  sauvés  perdus');
    for (let d = 0; d < days; d++) {
      const rs = out[player].map((r) => r[d]).filter(Boolean);
      const avg = (k: keyof DayRow) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
      console.log(`${String(d + 1).padStart(4)}  ${avg('level').toFixed(1).padStart(6)}  ${Math.round(avg('money')).toString().padStart(8)}  ${Math.round(avg('upkeep')).toString().padStart(11)}  ${avg('reputation').toFixed(0).padStart(10)}  ${avg('response').toFixed(1).padStart(10)}  ${Math.round(avg('saved')).toString().padStart(6)}  ${Math.round(avg('lost')).toString().padStart(6)}`);
    }
  }
  const series = (p: string, k: keyof DayRow) => JSON.stringify(Array.from({ length: days }, (_, d) => {
    const rs = out[p].map((r) => r[d]).filter(Boolean);
    return rs.reduce((a, r) => a + r[k], 0) / Math.max(1, rs.length);
  }));
  const chart = (title: string, k: keyof DayRow) => `<h2>${title}</h2><svg viewBox="0 0 600 180" data-a='${series('soigneux', k)}' data-b='${series('brouillon', k)}'></svg>`;
  const html = `<!doctype html><meta charset="utf-8"><title>Banc d'équilibrage</title>
<style>body{font:14px system-ui;background:#0b0e12;color:#e6edf3;max-width:680px;margin:24px auto;padding:0 16px}svg{width:100%;background:#11151b;border:1px solid #252c36}h2{font-size:14px;margin:20px 0 6px}.a{stroke:#3fb950}.b{stroke:#f0a531}</style>
<h1>Banc d'équilibrage</h1><p>${seeds} carrières par joueur, ${days} jours de jeu. <span style="color:#3fb950">Soigneux</span> · <span style="color:#f0a531">brouillon</span>.</p>
${chart('Niveau', 'level')}${chart('Caisse (€)', 'money')}${chart('Réputation', 'reputation')}${chart('Délai moyen (min)', 'response')}
<script>for(const s of document.querySelectorAll('svg')){const a=JSON.parse(s.dataset.a),b=JSON.parse(s.dataset.b);const all=[...a,...b,0];const lo=Math.min(...all),hi=Math.max(...all)||1;const line=(v,c)=>'<polyline class="'+c+'" fill="none" stroke-width="2" points="'+v.map((y,i)=>(20+i*560/Math.max(1,v.length-1))+','+(170-(y-lo)/(hi-lo||1)*150)).join(' ')+'"/>';s.innerHTML=line(a,'a')+line(b,'b')+'<text x="4" y="14" fill="#9aa4b2" font-size="11">'+Math.round(hi)+'</text><text x="4" y="176" fill="#9aa4b2" font-size="11">'+Math.round(lo)+'</text>';}</script>`;
  await Bun.write(new URL('./out/balance.html', import.meta.url), html);
  console.log('\ntools/out/balance.html écrit');
}
