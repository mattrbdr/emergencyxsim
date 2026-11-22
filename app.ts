// Emergency Sim's data module: what it may reach, who answers the view, who draws the map.
import type { Answer, Ctx2D, Frame } from './app.contract.d.ts';
import { fromScroll, syncView } from './render/camera.ts';
import { drawCity } from './render/layers.ts';
import { drawLive } from './render/live.ts';
import { game } from './src/game.ts';
import { sources } from './src/sources.ts';

export const grants =
  'net.fetch https://overpass-api.de\nnet.fetch https://overpass.kumi.systems\nnet.fetch https://overpass.private.coffee\nfs.read app:/data\nfs.write app:/data';

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);

export const surfaces: Record<string, number> = { city: 1, live: 1 };
export function draw(surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean {
  const a = args as unknown[];
  if (surface === 'city') {
    syncView(game.world, frame);
    fromScroll(game.world, Number(a[2] ?? -1), Number(a[3] ?? 0), Number(a[4] ?? 1), Number(a[5] ?? 0));
    return drawCity(game.world, ctx, frame, Number(a[1] ?? 0) / 4);
  }
  syncView(game.world, frame);
  fromScroll(game.world, Number(a[1] ?? -1), Number(a[2] ?? 0), Number(a[3] ?? 1), Number(a[4] ?? 0));
  return drawLive(game.world, ctx, frame, String(a[0] ?? ''));
}
