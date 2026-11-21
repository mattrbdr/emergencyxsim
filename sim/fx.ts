// What the player should notice, for the eyes and the ears: short-lived marks
// on the map (a ring where a call comes in, a stamp where it closes, a radio
// bubble over a crew) and the sound cue of the moment. The view plays them; the
// simulation only says what happened.
import type { World } from './types.ts';

export type FxKind = 'ring' | 'flash' | 'gain' | 'stamp' | 'bubble';
export interface Fx { id: number; kind: FxKind; x: number; y: number; text: string; tone: 'good' | 'bad' | 'info' | 'alert'; unit: string }

export type CueName = 'appel' | 'appel_p1' | 'radio' | 'depart' | 'crise' | 'gain' | 'promo';
/** Louder cues win when several fall in the same tick. */
const RANK: Record<CueName, number> = { radio: 1, gain: 2, depart: 3, appel: 4, appel_p1: 5, promo: 6, crise: 7 };

export function cue(w: World, name: CueName) {
  if (w.cue.seq === w.seq && RANK[w.cue.name as CueName] >= RANK[name]) return;
  w.cue = { id: w.cue.id + 1, name, seq: w.seq };
}

export function fx(w: World, kind: FxKind, x: number, y: number, text = '', tone: Fx['tone'] = 'info', unit = '') {
  w.fx.push({ id: ++w.fxId, kind, x, y, text, tone, unit });
  if (w.fx.length > 40) w.fx.shift();
}
