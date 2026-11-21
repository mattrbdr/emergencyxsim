// The view model: turns the world into the shapes ui/model.contract declares.
import type { Result } from '../app.contract.d.ts';
import { BUILDING_ORDER, BUILDINGS, KIND_OF_POI } from '../sim/catalog/buildings.ts';
import { FAMILY_LABEL } from '../sim/catalog/calls.ts';
import { MAX_LEVEL, XP_FOR_LEVEL, levelProgress } from '../sim/catalog/levels.ts';
import { UNIT_ORDER, UNITS, type UnitType } from '../sim/catalog/units.ts';
import { buildPrice, cannotBuy, isFirstBuilding, sitePrice, unitsOf } from '../sim/buildings.ts';
import { needState } from '../sim/calls.ts';
import { choices } from '../sim/scenes.ts';
import { clockText, minutesText } from '../sim/clock.ts';
import { upkeepPerHour } from '../sim/economy.ts';
import { coverageShare } from '../sim/coverage.ts';
import { shiftDay, streakBonus } from '../sim/contracts.ts';
import { guide } from '../sim/tutorial.ts';
import { euros } from '../sim/log.ts';
import { unlocksAt } from '../sim/progression.ts';
import type { Building, Call, UnitStatus, World } from '../sim/types.ts';
import { etaOf } from '../sim/units.ts';

type Snap = Result<'snapshot'>;

const STATUS: Record<UnitStatus, string> = {
  dispo: 'Disponible', route: 'En route', surplace: 'Sur place', transport: 'Transport', hopital: 'À l\'hôpital', retour: 'Retour',
};
const CALL_STATE: Record<Call['state'], string> = {
  nouveau: 'À qualifier', attente: 'À engager', engage: 'Moyens en route', bilan: 'Décision requise', traitement: 'Intervention', clos: 'Terminé',
};
const OUTCOME: Record<string, string> = { sauve: 'Réussi', perdu: 'Victime perdue', echec: 'Échec', '': '' };

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
    reward: c.state === 'clos' ? (c.earned > 0 ? `+${euros(c.earned)}` : '') : euros(c.kind.reward * c.bonus),
    risk: c.risk < 1 && c.state !== 'clos' ? `${Math.round(c.risk * 100)} % de réussite` : '',
    decision: {
      pending: c.state === 'bilan' && c.twist !== null,
      from: c.twist?.from ?? '',
      report: c.twist?.report ?? '',
      left: c.state === 'bilan' ? minutesText(c.decisionLeft) : '',
      choices: c.state === 'bilan' ? choices(w, c) : [],
    },
    needs: known
      ? needState(w, c).map((n) => ({ type: n.type, label: UNITS[n.type].long, service: UNITS[n.type].service, state: n.state }))
      : [],
    units: c.assigned
      .map((id) => w.units.find((u) => u.id === id))
      .filter((u) => u !== undefined)
      .map((u) => ({
        id: u.id, name: u.name, service: u.service,
        status: u.callId === c.id ? STATUS[u.status] : 'Libéré',
        eta: u.callId === c.id && u.status === 'route' ? minutesText(etaOf(w, u)) : '',
      })),
  };
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
    id: b.id, name: b.name, kind: b.kind, label: def.label, service: def.service,
    slots: b.slots, used: units.length, maxSlots: def.maxSlots, home: units.filter((u) => u.status === 'dispo').length,
    canExpand: b.slots < def.maxSlots, expandPrice: euros(def.expand),
    upkeep: `${euros(def.upkeep + units.reduce((s, u) => s + UNITS[u.type].upkeep, 0))}/h`,
    patients: b.patients,
  };
}

export function snapshot(w: World): Snap {
  const active = w.calls.filter((c) => c.state !== 'clos').sort((a, b) => a.priority - b.priority || a.at - b.at);
  const closed = w.calls.filter((c) => c.state === 'clos').sort((a, b) => b.closedAt - a.closedAt).slice(0, 10);
  const s = w.stats;
  const shown = Math.min(w.level, w.seenLevel + 1);
  const unlock = unlocksAt(shown);
  const next = w.level < MAX_LEVEL ? XP_FOR_LEVEL[w.level] : w.xp;
  return {
    seq: w.seq,
    city: w.city.name,
    attribution: w.city.file.attribution,
    day: shiftDay(w),
    clock: clockText(w.t),
    speed: w.speed,
    paused: w.paused,
    money: Math.round(w.money),
    moneyText: euros(w.money),
    upkeepText: upkeepPerHour(w) > 0 ? `−${euros(upkeepPerHour(w))}/h` : 'Entretien 0 €/h',
    level: w.level,
    maxLevel: MAX_LEVEL,
    xp: w.xp,
    xpText: w.level < MAX_LEVEL ? `${w.xp} / ${next} XP` : `${w.xp} XP`,
    levelProgress: levelProgress(w.xp),
    reputation: Math.round(w.reputation),
    unlock: {
      level: shown,
      vehicles: unlock.units.map((t) => shopItem(w, t, '')),
      buildings: unlock.buildings.map((k) => BUILDINGS[k].label),
      calls: unlock.calls.map((k) => k.title),
    },
    showUnlock: w.level > w.seenLevel,
    newCalls: active.filter((c) => !c.qualified).length,
    placing: w.placing?.kind ?? '',
    aimed: (w.placing?.node ?? -1) >= 0,
    aimText: w.placing && w.placing.node >= 0
      ? `+${Math.round(w.placing.gain * 100)} % · ${Math.round(w.placing.after * 100)} % de la ville à moins de 3 min`
      : '',
    placingPrice: w.placing ? euros(buildPrice(w, w.placing.kind)) : '',
    overlay: w.overlay,
    coverage: Math.round(coverageShare(w) * 100),
    firstBuilding: isFirstBuilding(w),
    calls: active.map((c) => callRow(w, c)),
    closed: closed.map((c) => callRow(w, c)),
    units: w.units.map((u) => {
      const b = w.buildings.find((x) => x.id === u.building);
      return {
        id: u.id, name: u.name, type: u.type, long: UNITS[u.type].long, service: u.service,
        status: u.status, statusLabel: STATUS[u.status], building: u.building, buildingName: b?.name ?? '',
        callTitle: w.calls.find((c) => c.id === u.callId)?.kind.title ?? '',
        eta: u.status === 'route' || u.status === 'transport' || u.status === 'retour' ? minutesText(etaOf(w, u)) : '',
        missions: u.missions, canSell: u.status === 'dispo', resale: euros(UNITS[u.type].price / 2),
      };
    }),
    free: w.units.filter((u) => u.status === 'dispo' || u.status === 'retour').length,
    buildings: w.buildings.map((b) => buildingRow(w, b)),
    sites: w.city.pois
      .map((p, index) => ({ p, index }))
      .filter(({ index }) => !w.buildings.some((b) => b.site === index))
      .map(({ p, index }) => {
        const kind = KIND_OF_POI[p.kind];
        const def = BUILDINGS[kind];
        return {
          index, name: p.name, kind, label: def.label, service: def.service,
          price: euros(sitePrice(w, kind)), open: def.level <= w.level, level: def.level,
        };
      }),
    build: BUILDING_ORDER.map((k) => ({
      kind: k, label: BUILDINGS[k].label, service: BUILDINGS[k].service,
      price: euros(buildPrice(w, k)), buyPrice: euros(sitePrice(w, k)),
      open: BUILDINGS[k].level <= w.level, level: BUILDINGS[k].level,
    })),
    log: w.log.slice(0, 40).map((l) => ({ id: l.id, at: clockText(l.t), text: l.text, tone: l.tone })),
    toast: { id: w.toast.id, at: clockText(w.toast.t), text: w.toast.text, tone: w.toast.tone },
    guide: guide(w),
    contracts: w.contracts.map((c) => ({
      id: c.id, label: c.label, state: c.state, xp: c.xp,
      progressText: c.kind === 'earn' ? `${euros(Math.min(c.progress, c.target))} / ${euros(c.target)}`
        : c.kind === 'coverage' ? `${c.progress} % / ${c.target} %`
        : c.kind === 'no_loss' ? (c.state === 'failed' ? 'Victime perdue' : c.state === 'done' ? 'Tenu' : 'En cours')
        : `${Math.min(c.progress, c.target)} / ${c.target}`,
      fraction: c.state === 'done' ? 1 : c.target > 0 ? Math.min(1, c.progress / c.target) : 0,
      reward: euros(Math.round(c.reward * streakBonus(w))),
    })),
    contractsDone: w.contracts.filter((c) => c.state === 'done').length,
    streak: w.streak,
    stats: {
      calls: s.calls, saved: s.saved, lost: s.lost, failed: s.failed,
      avgResponse: s.responses ? minutesText(s.responseSum / s.responses) : '—',
      accuracy: s.qualifyRight + s.qualifyWrong ? Math.round((s.qualifyRight / (s.qualifyRight + s.qualifyWrong)) * 100) : 100,
      earned: euros(s.earned), spent: euros(s.spent),
    },
  };
}
