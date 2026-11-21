// Emergency Sim's data module: it owns the shift (sim/world.ts), answers the
// view's requests, and draws the two map canvases (render/map.ts).
import type { Answer, Ctx2D, Frame, Result, Sources } from './app.contract.d.ts';
import cityFile from './data/city.json';
import { FAMILY_LABEL, SERVICE_LABEL, UNIT_TYPES, type Family, type UnitType } from './sim/catalog.ts';
import { loadCity, type CityFile } from './sim/city.ts';
import {
  clockText, dispatch, etaOf, isFree, needState, newWorld, options, qualify, recall, SHIFT_LENGTH, statusLabel, tick,
  type Call, type World,
} from './sim/world.ts';
import { drawCity, drawLive, focus, overview, pointer, wheel, zoomBy } from './render/map.ts';

export const grants = '';

const city = loadCity(cityFile as unknown as CityFile);
let world: World = newWorld(city, 1);

const minutes = (s: number) => {
  const m = Math.max(0, Math.round(s / 60));
  return m < 1 ? '< 1 min' : `${m} min`;
};

const CALL_STATE: Record<Call['state'], string> = {
  nouveau: 'Appel entrant', attente: 'À engager', engage: 'Moyens en route', traitement: 'Intervention', clos: 'Terminé',
};
const OUTCOME: Record<string, string> = { sauve: 'Réussi', perdu: 'Victime perdue', echec: 'Échec', '': '' };

function callRow(w: World, c: Call): Result<'snapshot'>['calls'][number] {
  const working = c.state === 'traitement';
  const total = working ? c.kind.work * 60 : c.deadline - c.at;
  const left = working ? c.workLeft : c.deadline - w.t;
  return {
    id: c.id,
    title: c.qualified || c.state === 'clos' ? c.kind.title : 'Appel non qualifié',
    family: c.qualified || c.state === 'clos' ? c.kind.family : '',
    familyLabel: c.qualified || c.state === 'clos' ? FAMILY_LABEL[c.kind.family] : 'À qualifier',
    priority: c.priority,
    address: c.address,
    caller: c.caller,
    state: c.state,
    stateLabel: c.state === 'clos' ? OUTCOME[c.outcome] : CALL_STATE[c.state],
    outcome: c.outcome,
    qualified: c.qualified,
    escalated: c.escalated,
    at: clockText(c.at),
    timeText: c.state === 'clos' ? clockText(c.closedAt) : working ? `fin dans ${minutes(left)}` : left > 0 ? `${minutes(left)}` : 'dépassé',
    fraction: Math.max(0, Math.min(1, left / Math.max(1, total))),
    needs: c.qualified
      ? needState(w, c).map((n) => ({ type: n.type, label: UNIT_TYPES[n.type].long, service: UNIT_TYPES[n.type].service, state: n.state }))
      : [],
    units: c.assigned
      .map((id) => w.units.find((u) => u.id === id))
      .filter((u) => u !== undefined)
      .map((u) => ({
        id: u.id, name: u.name, service: u.service,
        status: u.callId === c.id ? statusLabel(u.status) : 'Libéré',
        eta: u.callId === c.id && u.status === 'route' ? minutes(etaOf(w, u)) : '',
      })),
  };
}

function snapshot(w: World): Result<'snapshot'> {
  const active = w.calls.filter((c) => c.state !== 'clos').sort((a, b) => a.priority - b.priority || a.at - b.at);
  const closed = w.calls.filter((c) => c.state === 'clos').sort((a, b) => b.closedAt - a.closedAt).slice(0, 12);
  const avg = w.responses.length ? w.responses.reduce((a, b) => a + b, 0) / w.responses.length : 0;
  return {
    seq: w.seq,
    started: w.started,
    clock: clockText(w.t),
    progress: w.t / SHIFT_LENGTH,
    speed: w.speed,
    paused: w.paused,
    over: w.over,
    score: w.score,
    saved: w.saved,
    lost: w.lost,
    failed: w.failed,
    handled: w.calls.filter((c) => c.outcome === 'sauve').length,
    newCalls: active.filter((c) => !c.qualified).length,
    waiting: active.filter((c) => c.qualified && c.state === 'attente').length,
    avgResponse: w.responses.length ? minutes(avg) : '—',
    cost: `${Math.round(w.cost / 100) / 10} k€`,
    accuracy: w.qualifyRight + w.qualifyWrong ? Math.round((w.qualifyRight / (w.qualifyRight + w.qualifyWrong)) * 100) : 100,
    city: w.city.name,
    attribution: w.city.file.attribution,
    free: w.units.filter(isFree).length,
    fleet: w.units.length,
    calls: active.map((c) => callRow(w, c)),
    closed: closed.map((c) => callRow(w, c)),
    units: w.units.map((u) => ({
      id: u.id, name: u.name, type: u.type, long: UNIT_TYPES[u.type].long, service: u.service,
      serviceLabel: SERVICE_LABEL[u.service], status: u.status, statusLabel: statusLabel(u.status),
      station: w.city.pois[u.station]?.name ?? '',
      callTitle: w.calls.find((c) => c.id === u.callId)?.kind.title ?? '',
      eta: u.status === 'route' || u.status === 'transport' || u.status === 'retour' ? minutes(etaOf(w, u)) : '',
      missions: u.missions,
    })),
    stations: w.city.pois.map((p, i) => ({
      index: i, name: p.name, kind: p.kind,
      home: w.units.filter((u) => u.station === i && u.status === 'dispo').length,
      total: w.units.filter((u) => u.station === i).length,
      beds: p.kind === 'hospital' ? `${w.beds[i]} / 6 lits occupés` : '',
    })),
    log: w.log.slice(0, 30).map((l) => ({ id: l.id, at: clockText(l.t), text: l.text, tone: l.tone })),
    toast: { id: w.toast.id, at: clockText(w.toast.t), text: w.toast.text, tone: w.toast.tone },
  };
}

const ack = (picked = ''): Result<'tick'> => ({ seq: world.seq, cam: world.cam.seq, picked });

const sources: Sources = {
  snapshot: () => snapshot(world),
  dispatchOptions: ([callId]) =>
    options(world, callId).map((o) => ({
      id: o.unit.id, name: o.unit.name, type: o.unit.type, long: UNIT_TYPES[o.unit.type].long, service: o.unit.service,
      station: world.city.pois[o.unit.station]?.name ?? '', eta: minutes(o.eta), suggested: o.suggested, needed: o.needed,
      returning: o.unit.status === 'retour',
    })),
  start: ([seed]) => {
    const view = world.view, cam = world.cam;
    world = newWorld(city, Math.floor(seed) % 2147483646 || 1);
    world.view = view;
    if (view.w > 0) world.cam = { ...cam, seq: cam.seq + 1 };
    world.started = true;
    return ack();
  },
  tick: ([ms]) => { tick(world, ms); return ack(); },
  setSpeed: ([speed]) => { world.speed = speed; world.paused = false; world.seq++; return ack(); },
  setPaused: ([paused]) => { world.paused = paused; world.seq++; return ack(); },
  qualifyCall: ([id, family]) => { qualify(world, id, family as Family); return ack(); },
  send: ([id, ids]) => { dispatch(world, id, ids); return ack(); },
  recallUnit: ([id]) => { recall(world, id); world.seq++; return ack(); },
  gesture: ([kind, id, x, y]) => ack(pointer(world, kind, id, x, y)),
  wheelZoom: ([dy, x, y]) => { wheel(world, dy, x, y); return ack(); },
  camera: ([cmd, id, left, right, top, bottom]) => {
    const inset = [left, right, top, bottom];
    if (cmd === 'in') zoomBy(world, 1.6);
    else if (cmd === 'out') zoomBy(world, 1 / 1.6);
    else if (cmd === 'fit') overview(world);
    else if (cmd === 'call') {
      const c = world.calls.find((x) => x.id === id);
      if (c) focus(world, c.x, c.y, inset);
    } else if (cmd === 'unit') {
      const u = world.units.find((x) => x.id === id);
      if (u) focus(world, u.x, u.y, inset);
    } else if (cmd === 'station') {
      const p = world.city.pois[Number(id)];
      if (p) focus(world, p.x, p.y, inset);
    }
    return ack();
  },
};

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);

export const surfaces: Record<string, number> = { city: 1, live: 1 };
export function draw(surface: string, args: any[], ctx: Ctx2D, frame: Frame): boolean {
  if (surface === 'city') return drawCity(world, ctx, frame);
  return drawLive(world, ctx, frame, String(args[0] ?? ''));
}

export type { UnitType };
