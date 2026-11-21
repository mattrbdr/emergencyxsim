// Experience thresholds: level n starts at XP[n - 1].
export const XP_FOR_LEVEL = [0, 400, 1100, 2300, 4000, 6500, 10000, 14500, 20000, 27000, 35000, 45000];
export const MAX_LEVEL = XP_FOR_LEVEL.length;

export const levelFor = (xp: number) => {
  let level = 1;
  for (let i = 0; i < XP_FOR_LEVEL.length; i++) if (xp >= XP_FOR_LEVEL[i]) level = i + 1;
  return level;
};

/** 0 → 1 progress towards the next level (1 at the last level). */
export const levelProgress = (xp: number) => {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return 1;
  const lo = XP_FOR_LEVEL[level - 1], hi = XP_FOR_LEVEL[level];
  return (xp - lo) / (hi - lo);
};

export const START_MONEY = 30000;
export const START_REPUTATION = 50;
