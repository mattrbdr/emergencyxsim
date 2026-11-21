// Engine tests, hostless: bun test tools/
import { expect, test } from 'bun:test';
import cityFile from '../data/city.json';
import { loadCity, type CityFile } from '../sim/city.ts';
import { pathTo, search } from '../sim/routing.ts';
import { dispatch, newWorld, options, qualify, SHIFT_LENGTH, tick } from '../sim/world.ts';

const city = loadCity(cityFile as CityFile);

test('every station reaches every other one by road', () => {
  const tree = search(city, city.pois[0].node);
  for (const p of city.pois) {
    expect(Number.isFinite(tree.time[p.node])).toBe(true);
    const path = pathTo(tree, p.node);
    expect(path[path.length - 1]).toBe(city.pois[0].node);
  }
});

test('a call is qualified, dispatched, worked and closed', () => {
  const w = newWorld(city, 7);
  w.started = true;
  while (w.calls.length === 0) tick(w, 250);
  const call = w.calls[0];
  expect(call.state).toBe('nouveau');
  expect(qualify(w, call.id, call.kind.family)).toBe(true);
  const picks = options(w, call.id).filter((o) => o.suggested).map((o) => o.unit.id);
  expect(picks.length).toBe(call.needs.length);
  expect(dispatch(w, call.id, picks)).toBe(picks.length);
  for (let i = 0; i < 4 * 60 * 20 && call.state !== 'clos'; i++) tick(w, 250);
  expect(call.state).toBe('clos');
  expect(call.outcome).toBe('sauve');
  expect(w.score).toBeGreaterThan(0);
});

test('a perfect dispatcher saves most victims over a whole shift', () => {
  const w = newWorld(city, 42);
  w.started = true;
  w.speed = 4;
  while (!w.over) {
    tick(w, 250);
    for (const c of w.calls) {
      if (c.state === 'clos') continue;
      if (!c.qualified) qualify(w, c.id, c.kind.family);
      const picks = options(w, c.id).filter((o) => o.suggested).map((o) => o.unit.id);
      if (picks.length) dispatch(w, c.id, picks);
    }
  }
  expect(w.t).toBe(SHIFT_LENGTH);
  const handled = w.calls.length;
  console.log(`shift: score ${w.score}, saved ${w.saved}, lost ${w.lost}, failed ${w.failed}, calls kept ${handled}, avg response ${Math.round(w.responses.reduce((a, b) => a + b, 0) / w.responses.length)} s`);
  expect(w.saved).toBeGreaterThan(w.lost * 3);
});

test('the same seed replays the same shift', () => {
  const run = () => {
    const w = newWorld(city, 99);
    w.started = true;
    for (let i = 0; i < 2000; i++) tick(w, 250);
    return w.calls.map((c) => `${c.kind.id}@${c.address}`).join('|');
  };
  expect(run()).toBe(run());
});
