// Ranks: the player's grade follows their level, with its insignia.

export interface Rank { from: number; title: string; icon: string }

export const RANKS: Rank[] = [
  { from: 1, title: 'Sapeur', icon: 'g1' },
  { from: 3, title: 'Caporal', icon: 'g2' },
  { from: 5, title: 'Sergent', icon: 'g3' },
  { from: 7, title: 'Adjudant', icon: 'g4' },
  { from: 9, title: 'Lieutenant', icon: 'g5' },
  { from: 12, title: 'Capitaine', icon: 'g6' },
  { from: 15, title: 'Commandant', icon: 'g7' },
  { from: 18, title: 'Lieutenant-colonel', icon: 'g8' },
  { from: 21, title: 'Colonel', icon: 'g9' },
  { from: 24, title: 'Contrôleur général', icon: 'g10' },
];

export const rankOf = (level: number): Rank => [...RANKS].reverse().find((r) => level >= r.from) ?? RANKS[0];
/** The level brings a new grade. */
export const promotedAt = (level: number) => RANKS.some((r) => r.from === level && level > 1);
