// How hard the shift is, chosen when a career starts.
export type Difficulty = 'calme' | 'normal' | 'chargee';

export const DIFFICULTY: Record<Difficulty, { label: string; detail: string; calls: number; deadline: number; reward: number }> = {
  calme: { label: 'Calme', detail: 'Moins d\'appels, des délais plus longs.', calls: 0.7, deadline: 1.3, reward: 0.9 },
  normal: { label: 'Normale', detail: 'Le rythme prévu.', calls: 1, deadline: 1, reward: 1 },
  chargee: { label: 'Chargée', detail: 'Plus d\'appels, moins de marge, mieux payé.', calls: 1.35, deadline: 0.85, reward: 1.2 },
};
