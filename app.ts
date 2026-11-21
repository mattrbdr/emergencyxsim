// Emergency Sim's data module: what it may reach, who answers the view, who draws the map.
import type { Answer, Ctx2D, Frame } from './app.contract.d.ts';
import { drawCity } from './render/layers.ts';
import { drawLive } from './render/live.ts';
import { game } from './src/game.ts';
import { sources } from './src/sources.ts';

export const grants =
  'net.fetch https://overpass-api.de\nnet.fetch https://overpass.kumi.systems\nnet.fetch https://overpass.private.coffee\nfs.read app:/data\nfs.write app:/data';

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);

export const surfaces: Record<string, number> = { city: 1, live: 1 };
export function draw(surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean {
  if (surface === 'city') return drawCity(game.world, ctx, frame, Number(args[1] ?? 0) / 4);
  return drawLive(game.world, ctx, frame, String(args[0] ?? ''));
}
