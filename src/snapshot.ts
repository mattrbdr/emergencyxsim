// The view model: turns the world into the shapes ui/model.contract declares.
import type { Result } from '../app.contract.d.ts';
import { CREW, isTired, servicePrice } from '../sim/crews.ts';
import { cannotUpgrade, has, maxSlots, upgradesFor, upgradesUpkeep } from '../sim/upgrades.ts';
import { ACHIEVEMENTS } from '../sim/catalog/achievements.ts';
import { promotedAt, rankOf } from '../sim/catalog/ranks.ts';
import { bulletin, dateText, eventHours, shiftHour, today } from '../sim/weather.ts';
import { BUILDING_ORDER, BUILDINGS, KIND_OF_POI } from '../sim/catalog/buildings.ts';
import { FAMILY_LABEL } from '../sim/catalog/calls.ts';
import { MAX_LEVEL, XP_FOR_LEVEL, levelProgress } from '../sim/catalog/levels.ts';
import { UNIT_ORDER, UNITS, type UnitType } from '../sim/catalog/units.ts';
import { buildPrice, cannotBuy, isFirstBuilding, sitePrice, unitsOf } from '../sim/buildings.ts';
import { needState } from '../sim/calls.ts';
import { choices } from '../sim/scenes.ts';
import { activeMajor, majorChoices, majorOf } from '../sim/majors.ts';
import { clockText, minutesText } from '../sim/clock.ts';
import { upkeepPerHour } from '../sim/economy.ts';
import { coverageShare } from '../sim/coverage.ts';
import { shiftDay, streakBonus } from '../sim/contracts.ts';
import { guide } from '../sim/tutorial.ts';
import { euros } from '../sim/log.ts';
import { unlocksAt } from '../sim/progression.ts';
import type { Building, Call, World } from '../sim/types.ts';
import { STATUS } from '../sim/catalog/status.ts';
import { etaOf, isFree } from '../sim/units.ts';

type Snap = Result<'snapshot'>;

const CALL_STATE: Record<Call['state'], string> = {
  nouveau: 'À qualifier', attente: 'À engager', engage: 'Moyens en route', bilan: 'Décision requise', traitement: 'Intervention', clos: 'Terminé',
};
const OUTCOME: Record<string, string> = { sauve: 'Réussi', perdu: 'Victime perdue', echec: 'Échec', '': '' };

function majorLabel(w: World, c: Call): string {
  const m = majorOf(w, c);
  return m ? `${m.kind.title.toUpperCase()} · PHASE ${m.kind.phases.findIndex((p) => c.kind.id.endsWith(`:${p.id}`)) + 1}/${m.kind.phases.length}` : '';
}

function crisis(w: World): Snap['crisis'] {
  const m = activeMajor(w);
  if (!m) return { active: false, title: '', phaseTitle: '', index: 0, total: 0, callId: '', injured: 0 };
  return {
    active: true, title: m.kind.title, phaseTitle: m.kind.phases[m.phase].title, index: m.phase + 1,
    total: m.kind.phases.length, callId: m.callId, injured: m.injured,
  };
}

function callRow(w: World, c: Call): Snap['calls'][number] {
  const working = c.state === 'traitement';
  const total = working ? c.kind.work * 60 : c.deadline - c.at;
  const left = working ? c.workLeft : c.deadline - w.t;
  const known = c.qualified || c.state === 'clos';
  return {
    id: c.id,
    title: known ? c.kind.title : 'Appel entrant',
    family: known ? c.kind.family : '',
    familyLabel: known ? FAMILY_LABEL[c.kind.family] : 'Non qualifié',
    priority: c.priority,
    address: c.address,
    caller: c.caller,
    state: c.state,
    stateLabel: c.state === 'clos' ? OUTCOME[c.outcome] : CALL_STATE[c.state],
    outcome: c.outcome,
    qualified: c.qualified,
    escalated: c.escalated,
    at: clockText(c.at),
    timeText: c.state === 'clos' ? clockText(c.closedAt) : working ? minutesText(left) : left > 0 ? minutesText(left) : 'dépassé',
    fraction: Math.max(0, Math.min(1, left / Math.max(1, total))),
    // Nobody on the way and less than two minutes left: it is about to get worse.
    soon: !working && c.state !== 'clos' && c.assigned.length === 0 && left > 0 && left < 120,
    reward: c.majorId ? '' : c.state === 'clos' ? (c.earned > 0 ? `+${euros(c.earned)}` : '') : euros(c.kind.reward * c.bonus),
    risk: c.risk < 1 && c.state !== 'clos' ? `${Math.round(c.risk * 100)} % de réussite` : '',
    major: majorLabel(w, c),
    decision: {
      pending: c.state === 'bilan' && (c.twist !== null || c.prompt !== null),
      from: c.prompt?.from ?? c.twist?.from ?? '',
      report: c.prompt?.report ?? c.twist?.report ?? '',
      left: c.state === 'bilan' ? minutesText(c.decisionLeft) : '',
      choices: c.state !== 'bilan' ? [] : c.prompt ? majorChoices(w, c) : choices(w, c),
    },
    needs: known
      ? needState(w, c).map((n) => ({ type: n.type, label: UNITS[n.type].long, service: UNITS[n.type].service, state: n.state }))
      : [],
    units: c.assigned
      .map((id) => w.units.find((u) => u.id === id))
      .filter((u) => u !== undefined)
      .map((u) => ({
        id: u.id, name: u.name, service: u.service,
        status: u.callId === c.id ? `${STATUS[u.status].code} ${STATUS[u.status].label}` : 'Libéré',
        eta: u.callId === c.id && u.status === 'route' ? minutesText(etaOf(w, u)) : '',
      })),
  };
}

export function upgradeItems(w: World, b: Building) {
  return upgradesFor(b).map((u) => ({
    id: u.id, label: u.label, detail: u.detail, price: euros(u.price), upkeep: `+${euros(u.upkeep)}/h`,
    why: has(b, u.id) ? '' : cannotUpgrade(w, b, u.id), owned: has(b, u.id),
  }));
}

export function shopItems(w: World, b: Building): Snap['unlock']['vehicles'] {
  return UNIT_ORDER.filter((t) => UNITS[t].building === b.kind).map((t) => shopItem(w, t, cannotBuy(w, b, t)));
}

function shopItem(w: World, t: UnitType, why: string): Snap['unlock']['vehicles'][number] {
  const d = UNITS[t];
  return {
    type: t, label: d.label, long: d.long, service: d.service, price: euros(d.price), upkeep: `${euros(d.upkeep)}/h`,
    level: d.level, why, owned: w.units.filter((u) => u.type === t).length,
  };
}

function buildingRow(w: World, b: Building): Snap['buildings'][number] {
  const def = BUILDINGS[b.kind];
  const units = unitsOf(w, b);
  return {
    id: b.id, name: b.name, kind: b.kind, label: def.label, service: def.service, upgradesText: `${b.upgrades.length} / ${upgradesFor(b).length}`,
    slots: b.slots, used: units.length, maxSlots: def.maxSlots, home: units.filter((u) => u.status === 'dispo').length,
    canExpand: b.slots < maxSlots(b), expandPrice: euros(def.expand),
    upkeep: `${euros(def.upkeep + upgradesUpkeep(b) + units.reduce((s, u) => s + UNITS[u.type].upkeep, 0))}/h`,
    patients: b.patients,
  };
}

type Row<K extends keyof Snap> = Snap[K] extends (infer T)[] ? T : never;

function unitRow(w: World, u: World['units'][number]): Row<'units'> {
  const moving = u.status === 'route' || u.status === 'transport' || u.status === 'retour';
  return {
    id: u.id, name: u.name, type: u.type, long: UNITS[u.type].long, service: u.service,
    status: u.status, statusCode: STATUS[u.status].code, statusLabel: STATUS[u.status].label,
    building: u.building, buildingName: w.buildings.find((x) => x.id === u.building)?.name ?? '',
    callTitle: w.calls.find((c) => c.id === u.callId)?.kind.title ?? '',
    eta: moving ? minutesText(etaOf(w, u)) : '',
    missions: u.missions, canSell: u.status === 'dispo', resale: euros(UNITS[u.type].price / 2),
    fatigue: Math.round(u.fatigue), wear: Math.round(u.wear), tired: isTired(u),
    canRest: u.status === 'dispo' && u.fatigue > CREW.backAt, canService: u.status === 'dispo' && u.wear > 0,
    servicePrice: euros(servicePrice(w, u)),
    canPost: (u.status === 'dispo' || u.status === 'poste') && !u.flight, canStandDown: u.status === 'poste',
    waitText: u.status === 'atelier' ? `encore ${minutesText(u.wait)}` : u.status === 'repos' ? `reprise à ${CREW.backAt} % de fatigue` : '',
  };
}

function siteRows(w: World): Snap['sites'] {
  return w.city.pois.flatMap((p, index) => {
    if (w.buildings.some((b) => b.site === index)) return [];
    const kind = KIND_OF_POI[p.kind];
    const def = BUILDINGS[kind];
    return [{
      index, name: p.name, kind, label: def.label, service: def.service,
      price: euros(sitePrice(w, kind)), open: def.level <= w.level, level: def.level,
    }];
  });
}

function buildOptions(w: World): Snap['build'] {
  return BUILDING_ORDER.map((k) => ({
    kind: k, label: BUILDINGS[k].label, service: BUILDINGS[k].service,
    price: euros(buildPrice(w, k)), buyPrice: euros(sitePrice(w, k)),
    open: BUILDINGS[k].level <= w.level, level: BUILDINGS[k].level,
  }));
}

function contractRow(w: World, c: World['contracts'][number]): Row<'contracts'> {
  const capped = Math.min(c.progress, c.target);
  const progressText =
    c.kind === 'earn' ? `${euros(capped)} / ${euros(c.target)}`
    : c.kind === 'coverage' ? `${c.progress} % / ${c.target} %`
    : c.kind === 'no_loss' ? (c.state === 'failed' ? 'Victime perdue' : c.state === 'done' ? 'Tenu' : 'En cours')
    : `${capped} / ${c.target}`;
  return {
    id: c.id, label: c.label, state: c.state, xp: c.xp, progressText,
    fraction: c.state === 'done' ? 1 : c.target > 0 ? Math.min(1, c.progress / c.target) : 0,
    reward: euros(Math.round(c.reward * streakBonus(w))),
  };
}

function statsRow(w: World): Snap['stats'] {
  const s = w.stats;
  const graded = s.qualifyRight + s.qualifyWrong;
  return {
    calls: s.calls, saved: s.saved, lost: s.lost, failed: s.failed,
    avgResponse: s.responses ? minutesText(s.responseSum / s.responses) : 'n.d.',
    accuracy: graded ? Math.round((s.qualifyRight / graded) * 100) : 100,
    earned: euros(s.earned), spent: euros(s.spent),
  };
}

function unlockCard(w: World): Snap['unlock'] {
  const level = Math.min(w.level, w.seenLevel + 1);
  const unlock = unlocksAt(level);
  return {
    level,
    vehicles: unlock.units.map((t) => shopItem(w, t, '')),
    buildings: unlock.buildings.map((k) => BUILDINGS[k].label),
    calls: unlock.calls.map((k) => k.title),
    majors: unlock.majors.map((k) => k.title),
    upgrades: [...new Set(unlock.upgrades.map((u) => u.label))],
    promoted: promotedAt(level), rank: rankOf(level).title, rankIcon: rankOf(level).icon,
  };
}

/** Won first (latest first), then the closest to being won. */
function achievementRows(w: World): Snap['achievements'] {
  return ACHIEVEMENTS.map((a) => {
    const done = w.achievements.includes(a.id);
    const [value, target] = a.goal(w);
    const fraction = done ? 1 : Math.max(0, Math.min(1, value / target));
    return {
      id: a.id, title: a.title, detail: a.detail, done, fraction,
      progressText: done ? 'Obtenu' : target > 1 ? `${grouped(Math.min(value, target))} / ${grouped(target)}` : '',
      reward: [a.money ? euros(a.money) : '', a.xp ? `${a.xp} XP` : ''].filter(Boolean).join(' · '),
      order: done ? -1 - w.achievements.indexOf(a.id) * 0.001 : 1 - fraction,
    };
  }).sort((a, b) => a.order - b.order).map(({ order: _, ...row }) => row);
}

export const logLine = (l: World['log'][number]) => ({ id: l.id, at: clockText(l.t), text: l.text, tone: l.tone });

/** The log for the main courante view, filtered. */
export function journalLines(w: World, filter: string) {
  const keep = (l: World['log'][number]) =>
    filter === 'alertes' ? l.tone === 'alert' || l.tone === 'bad'
      : filter === 'argent' ? l.tone === 'money' || /€/.test(l.text)
        : filter === 'succes' ? l.text.startsWith('Succès') || l.text.startsWith('Niveau')
          : true;
  return w.log.filter(keep).map(logLine);
}

/** What each of the 25 levels brings, for the progression timeline. */
export function roadmap() {
  return Array.from({ length: MAX_LEVEL }, (_, i) => {
    const level = i + 1;
    const u = unlocksAt(level);
    return {
      level, rank: rankOf(level).title, rankIcon: rankOf(level).icon, promoted: promotedAt(level) || level === 1,
      items: [
        ...u.buildings.map((k) => BUILDINGS[k].label),
        ...u.units.map((t) => `${UNITS[t].label} · ${UNITS[t].long}`),
        ...[...new Set(u.upgrades.map((x) => x.label))].map((l) => `Amélioration · ${l}`),
      ],
      calls: u.calls.length,
      majors: u.majors.map((k) => k.title),
    };
  });
}

function nightStep(w: World): number {
  const h = shiftHour(w.t);
  const level = h < 20 ? 0 : h < 23 ? (h - 20) / 3 : h < 29 ? 1 : Math.max(0, (31 - h) / 2);
  return Math.round(level * 4);
}

const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function weatherRow(w: World): Snap['weather'] {
  const t = today(w);
  // The event under way, or else the next one today.
  const h = shiftHour(w.t);
  const e = t.events.find((x) => h >= x.def.from && h < x.def.to) ?? t.events.find((x) => h < x.def.from);
  return {
    label: t.weather.label, icon: t.weather.icon, bulletin: bulletin(t),
    event: e ? `${e.def.label} · ${eventHours(e.def)}` : '', eventIcon: e?.def.icon ?? '',
  };
}

export function snapshot(w: World): Snap {
  const active = w.calls.filter((c) => c.state !== 'clos').sort((a, b) => a.priority - b.priority || a.at - b.at);
  const closed = w.calls.filter((c) => c.state === 'clos').sort((a, b) => b.closedAt - a.closedAt).slice(0, 10);
  const next = w.level < MAX_LEVEL ? XP_FOR_LEVEL[w.level] : w.xp;
  const upkeep = upkeepPerHour(w);
  const aim = w.placing && w.placing.node >= 0 ? w.placing : null;
  return {
    seq: w.seq,
    city: w.city.name,
    attribution: w.city.file.attribution,
    day: shiftDay(w),
    date: dateText(today(w).date),
    weather: weatherRow(w),
    // Night on the map in five steps (0 day – 4 deep night), for the city canvas.
    night: nightStep(w),
    posting: w.units.find((u) => u.id === w.posting)?.name ?? '',
    cue: { id: w.cue.id, name: w.cue.name },
    settings: { ...w.settings },
    rank: rankOf(w.level).title,
    rankIcon: rankOf(w.level).icon,
    achievements: achievementRows(w),
    achievementsDone: w.achievements.length,
    clock: clockText(w.t),
    speed: w.speed,
    paused: w.paused,
    money: Math.round(w.money),
    moneyText: euros(w.money),
    upkeepText: upkeep > 0 ? `−${euros(upkeep)}/h` : 'Entretien 0 €/h',
    level: w.level,
    maxLevel: MAX_LEVEL,
    xp: w.xp,
    xpText: w.level < MAX_LEVEL ? `${w.xp} / ${next} XP` : `${w.xp} XP`,
    levelProgress: levelProgress(w.xp),
    reputation: Math.round(w.reputation),
    unlock: unlockCard(w),
    showUnlock: w.level > w.seenLevel,
    newCalls: active.filter((c) => !c.qualified).length,
    placing: w.placing?.kind ?? '',
    aimed: aim !== null,
    aimText: aim ? `+${Math.round(aim.gain * 100)} % · ${Math.round(aim.after * 100)} % de la ville à moins de 3 min` : '',
    placingPrice: w.placing ? euros(buildPrice(w, w.placing.kind)) : '',
    overlay: w.overlay,
    coverage: Math.round(coverageShare(w) * 100),
    firstBuilding: isFirstBuilding(w),
    calls: active.map((c) => callRow(w, c)),
    closed: closed.map((c) => callRow(w, c)),
    units: w.units.map((u) => unitRow(w, u)),
    free: w.units.filter(isFree).length,
    buildings: w.buildings.map((b) => buildingRow(w, b)),
    sites: siteRows(w),
    build: buildOptions(w),
    log: w.log.slice(0, 5).map(logLine),
    toast: { id: w.toast.id, at: clockText(w.toast.t), text: w.toast.text, tone: w.toast.tone },
    guide: guide(w),
    crisis: crisis(w),
    report: w.majorReport
      ? { show: true, title: w.majorReport.title, success: w.majorReport.success, injured: w.majorReport.injured, earned: euros(w.majorReport.earned), minutes: w.majorReport.minutes }
      : { show: false, title: '', success: false, injured: 0, earned: '', minutes: 0 },
    contracts: w.contracts.map((c) => contractRow(w, c)),
    contractsDone: w.contracts.filter((c) => c.state === 'done').length,
    streak: w.streak,
    stats: statsRow(w),
  };
}
