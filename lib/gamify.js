// lib/gamify.js
// Central place for XP, level, and streak math so the rules live in exactly
// one place and every storage adapter agrees on them.

export const XP_PER_PRIORITY = { low: 10, mid: 20, high: 30 };
export const XP_PER_LEVEL = 150;

export function xpForPomodoro(minutes) {
  return Math.round((minutes / 25) * 15);
}

export function levelForXp(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function xpIntoLevel(xp) {
  return xp % XP_PER_LEVEL;
}

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

/** Advances streak at most once per UTC calendar day. Mutates and returns state. */
export function advanceStreak(state) {
  const today = todayKey();
  if (state.lastCompletionDate === today) return { state, changed: false };

  if (state.lastCompletionDate === yesterdayKey() || !state.lastCompletionDate) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }
  state.lastCompletionDate = today;
  return { state, changed: true };
}

/** Applies an XP delta and reports whether this crossed a level boundary. */
export function applyXp(state, delta) {
  const beforeLevel = levelForXp(Math.max(state.xp, 0));
  state.xp = Math.max(0, state.xp + delta);
  const afterLevel = levelForXp(state.xp);
  return { leveledUp: afterLevel > beforeLevel, level: afterLevel };
}

export const ACHIEVEMENTS = [
  {
    id: "first-step",
    name: "First Little Quest",
    desc: "Complete your first task",
    check: (ctx) => ctx.tasksDone >= 1,
  },
  {
    id: "sync-3",
    name: "Three-Day Bloom",
    desc: "Show up on three days",
    check: (ctx) => ctx.streak >= 3,
  },
  {
    id: "week-warrior",
    name: "Seven-Day Garden",
    desc: "Show up on seven days",
    check: (ctx) => ctx.streak >= 7,
  },
  {
    id: "deep-focus",
    name: "Deep Focus",
    desc: "Complete a 50-minute focus session",
    check: (ctx) => ctx.longestFocusMinutes >= 50,
  },
  {
    id: "hydrated-mind",
    name: "Hydrated Mind",
    desc: "Fill all 8 glasses in a single day",
    check: (ctx) => ctx.maxWaterInDay >= 8,
  },
  {
    id: "self-aware",
    name: "Feelings Almanac",
    desc: "Log your mood five times, if you like",
    check: (ctx) => ctx.moodLogCount >= 5,
  },
];

export function computeAchievements(context) {
  const ctx = {
    tasksDone: Number(context.tasksDone) || 0,
    streak: Number(context.streak) || 0,
    longestFocusMinutes: Number(context.longestFocusMinutes) || 0,
    maxWaterInDay: Number(context.maxWaterInDay) || 0,
    moodLogCount: Number(context.moodLogCount) || 0,
  };
  return ACHIEVEMENTS.map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    desc: achievement.desc,
    unlocked: achievement.check(ctx),
  }));
}
