// The game's tuning, in one place. Times are game seconds unless named otherwise.
export const RULES = {
  /** Open calls beyond which no new call comes in. */
  maxOpenCalls: 10,

  // On-scene decisions (sim/scenes.ts).
  decisionTime: 4 * 60,
  reinforcement: { bonus: 1.3, extraTime: 14 * 60 },
  makeDo: { success: 0.6, workFactor: 1.5 },
  evacuate: { success: 0.75, bonus: 0.8, maxWork: 3 * 60 },

  // A fire left too long spreads once, with this much more time.
  escalationTime: 10 * 60,

  // Hospitals.
  /** Seconds a crew on scene keeps a victim alive past the deadline while the rest comes. */
  stabilizeTime: 10 * 60,
  hospitalStay: 4 * 60,
  ownHospitalFee: 600,
  dischargeEvery: 40 * 60,

  // Reputation (0–100) and what moves it.
  reputation: { wrongQualification: -2, escalation: -3, victimLost: -4, failure: -3, successP1: 2, success: 1 },
  /** Reward multiplier at reputation 0 and 100. */
  reputationFactor: { min: 0.75, max: 1.25 },
  /** Up to +30 % for arriving early, 2 % per minute ahead of the deadline. */
  earlyBonus: { perMinute: 0.02, max: 0.3 },

  // Daily contracts.
  streak: { perDay: 0.1, maxDays: 5 },
} as const;
