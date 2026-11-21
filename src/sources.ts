// What the view can ask (resources) and order (mutations). Each answer is one
// line into the simulation; the reply is an Ack the view uses to refresh.
import type { Result, Sources } from '../app.contract.d.ts';
import type { BuildingKind } from '../sim/catalog/buildings.ts';
import type { Family } from '../sim/catalog/calls.ts';
import { UNITS, type UnitType } from '../sim/catalog/units.ts';
import { buildAt, buySite, buyUnit, expand, sellUnit } from '../sim/buildings.ts';
import { dispatch, findCall, options, presets, qualify, recall } from '../sim/calls.ts';
import { standDown, startPosting } from '../sim/posting.ts';
import { rest, service } from '../sim/crews.ts';
import { buyUpgrade } from '../sim/upgrades.ts';
import type { UpgradeId } from '../sim/catalog/upgrades.ts';
import { decide, type ChoiceId } from '../sim/scenes.ts';
import { decideMajor } from '../sim/majors.ts';
import { dismissTip, skipTutorial } from '../sim/tutorial.ts';
import { minutesText } from '../sim/clock.ts';
import { buildingUnlocked } from '../sim/progression.ts';
import { tick } from '../sim/world.ts';
import { focus, overview, zoomBy } from '../render/camera.ts';
import { pointer, wheel } from '../render/gestures.ts';
import { downloadCommune, searchCommune, status } from './city-loader.ts';
import { autosave, boot, demoCity, game, resetCareer, save, startCareer } from './game.ts';
import { journalLines, roadmap, shopItems, snapshot, upgradeItems } from './snapshot.ts';

const ack = (picked = ''): Result<'tick'> => ({ seq: game.world.seq, cam: game.world.cam.seq, picked });

export const sources: Sources = {
  // ------------------------------------------------ reads
  boot: async ([, epoch], _store, storage) => {
    await boot(storage, epoch);
    return { ready: game.ready, city: game.world.city.name };
  },
  snapshot: () => snapshot(game.world),
  dispatchOptions: ([callId]) =>
    options(game.world, callId).map((o) => ({
      id: o.unit.id, name: o.unit.name, type: o.unit.type, long: UNITS[o.unit.type].long, service: o.unit.service,
      station: o.diverted ? `Réquisition · en route ${o.diverted}` : game.world.buildings.find((b) => b.id === o.unit.building)?.name ?? '',
      eta: minutesText(o.eta), suggested: o.suggested, needed: o.needed, returning: o.unit.status === 'retour', tired: o.tired,
    })),
  journal: ([filter]) => journalLines(game.world, filter),
  roadmap: () => roadmap(),
  upgrades: ([buildingId]) => {
    const b = game.world.buildings.find((x) => x.id === buildingId);
    return b ? upgradeItems(game.world, b) : [];
  },
  buyUpgrade: ([buildingId, id], _store, storage) => { if (buyUpgrade(game.world, buildingId, id as UpgradeId)) save(storage); game.world.seq++; return ack(); },
  shop: ([buildingId]) => {
    const b = game.world.buildings.find((x) => x.id === buildingId);
    return b ? shopItems(game.world, b) : [];
  },
  cityStatus: () => ({
    phase: status.phase, message: status.message, matches: status.matches,
    busy: ['search', 'roads', 'areas', 'build'].includes(status.phase),
  }),

  // ------------------------------------------------ the town
  searchCity: async ([name]) => { await searchCommune(name); return ack(); },
  chooseCity: async ([insee, name, seed, date], _store, storage) => {
    const file = await downloadCommune(insee, name);
    if (file) startCareer(storage, file, seed, true, date);
    return ack(file ? 'ready' : '');
  },
  useDemo: ([seed, date], _store, storage) => { startCareer(storage, demoCity(), seed, false, date); return ack('ready'); },
  newCareer: async (_args, _store, storage) => { await resetCareer(storage); return ack(); },

  // ------------------------------------------------ time
  tick: ([ms], _store, storage) => {
    if (!game.ready) return ack();
    const before = game.world.majors.length;
    tick(game.world, ms);
    autosave(storage);
    // A crisis that just broke out: the view glides the map to it.
    const fresh = game.world.majors.length > before ? game.world.majors.at(-1)! : null;
    return ack(fresh ? `crisis:${fresh.callId}` : '');
  },
  setSpeed: ([speed]) => { game.world.speed = speed; game.world.paused = false; game.world.seq++; return ack(); },
  setPaused: ([paused]) => { game.world.paused = paused; game.world.seq++; return ack(); },

  // ------------------------------------------------ dispatch
  qualifyCall: ([id, family]) => { qualify(game.world, id, family as Family); return ack(); },
  send: ([id, ids]) => { dispatch(game.world, id, ids); return ack(); },
  dispatchPresets: ([callId]) =>
    presets(game.world, callId).map((p) => ({
      id: p.id, label: p.label, units: p.units,
      names: p.units.map((id) => game.world.units.find((u) => u.id === id)?.name ?? '').join(', '),
      eta: minutesText(p.eta),
      cost: p.loss >= 0.01 ? `−${Math.round(p.loss * 100)} % de couverture · ${p.where}` : 'Couverture préservée',
      costly: p.loss >= 0.05,
    })),
  postUnit: ([id]) => { startPosting(game.world, id); game.world.seq++; return ack(); },
  cancelPosting: () => { game.world.posting = ''; game.world.seq++; return ack(); },
  standDown: ([id], _store, storage) => { if (standDown(game.world, id)) save(storage); game.world.seq++; return ack(); },
  recallUnit: ([id]) => { recall(game.world, id); game.world.seq++; return ack(); },
  restUnit: ([id], _store, storage) => { if (rest(game.world, id)) save(storage); game.world.seq++; return ack(); },
  serviceUnit: ([id], _store, storage) => { if (service(game.world, id)) save(storage); game.world.seq++; return ack(); },
  decide: ([callId, choice]) => {
    const call = findCall(game.world, callId);
    if (call?.prompt) decideMajor(game.world, call, choice);
    else if (call) decide(game.world, call, choice as ChoiceId);
    return ack();
  },

  // ------------------------------------------------ building and buying
  startPlacing: ([kind]) => {
    const k = kind as BuildingKind;
    game.world.placing = buildingUnlocked(game.world, k) ? { kind: k, node: -1, gain: 0, after: 0 } : null;
    game.world.overlay = game.world.placing !== null;
    game.world.cam.seq++;
    game.world.seq++;
    return ack();
  },
  cancelPlacing: () => { game.world.placing = null; game.world.overlay = false; game.world.cam.seq++; game.world.seq++; return ack(); },
  confirmPlacing: (_args, _store, storage) => {
    const w = game.world;
    const p = w.placing;
    if (!p || p.node < 0) return ack();
    const b = buildAt(w, p.kind, w.city.nx[p.node], w.city.ny[p.node]);
    if (b) { w.placing = null; w.overlay = false; save(storage); }
    w.cam.seq++;
    w.seq++;
    return ack(b ? `built:${b.id}` : '');
  },
  closeReport: () => { game.world.majorReport = null; game.world.seq++; return ack(); },
  dismissTip: () => { dismissTip(game.world); game.world.seq++; return ack(); },
  skipTutorial: () => { skipTutorial(game.world); game.world.seq++; return ack(); },
  toggleOverlay: () => { game.world.overlay = !game.world.overlay; game.world.cam.seq++; game.world.seq++; return ack(); },
  buySite: ([index], _store, storage) => {
    const b = buySite(game.world, index);
    if (b) { game.world.placing = null; game.world.overlay = false; save(storage); }
    game.world.cam.seq++;
    game.world.seq++;
    return ack(b ? `building:${b.id}` : '');
  },
  expandBuilding: ([id], _store, storage) => { if (expand(game.world, id)) save(storage); game.world.seq++; return ack(); },
  buyVehicle: ([buildingId, type], _store, storage) => {
    const u = buyUnit(game.world, buildingId, type as UnitType);
    if (u) save(storage);
    game.world.seq++;
    return ack(u ? `unit:${u.id}` : '');
  },
  sellVehicle: ([id], _store, storage) => { if (sellUnit(game.world, id)) save(storage); game.world.seq++; return ack(); },
  seenLevel: (_args, _store, storage) => {
    game.world.seenLevel = Math.min(game.world.level, game.world.seenLevel + 1);
    game.world.dirty = true;
    save(storage);
    return ack();
  },

  // ------------------------------------------------ the map
  gesture: ([kind, id, x, y], _store, storage) => {
    const picked = pointer(game.world, kind, id, x, y);
    if (picked.startsWith('built:')) save(storage);
    return ack(picked);
  },
  wheelZoom: ([dy, x, y]) => { wheel(game.world, dy, x, y); return ack(); },
  camera: ([cmd, id, left, right, top, bottom]) => {
    const w = game.world;
    const inset = [left, right, top, bottom];
    const at = (x: number, y: number) => focus(w, x, y, inset);
    if (cmd === 'in') zoomBy(w, 1.6);
    else if (cmd === 'out') zoomBy(w, 1 / 1.6);
    else if (cmd === 'fit') overview(w);
    else if (cmd === 'call') { const c = w.calls.find((x) => x.id === id); if (c) at(c.x, c.y); }
    else if (cmd === 'unit') { const u = w.units.find((x) => x.id === id); if (u) at(u.x, u.y); }
    else if (cmd === 'building') { const b = w.buildings.find((x) => x.id === id); if (b) at(b.x, b.y); }
    else if (cmd === 'site') { const p = w.city.pois[Number(id)]; if (p) at(p.x, p.y); }
    return ack();
  },
};
