// routes/state.js
import { Router } from "express";
import { db } from "../db.js";
import {
  getOrCreateUserState,
  applyXp,
  advanceStreak,
  levelForXp,
  xpIntoLevel,
  xpForPomodoro,
  todayKey,
  computeAchievements,
  XP_PER_LEVEL,
} from "../lib/gamify.js";

const router = Router();

router.get("/me", (req, res) => {
  const user = db.data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ id: user.id, name: user.name, email: user.email });
});

router.get("/state", (req, res) => {
  const state = getOrCreateUserState(db, req.userId);
  const today = todayKey();

  const waterEntry = db.data.waterLogs.find(
    (w) => w.userId === req.userId && w.date === today
  );
  const pomodoroToday = db.data.pomodoroSessions.filter(
    (s) => s.userId === req.userId && s.type === "focus" && s.completedAt.startsWith(today)
  ).length;

  res.json({
    xp: state.xp,
    level: levelForXp(state.xp),
    xpIntoLevel: xpIntoLevel(state.xp),
    xpForNextLevel: XP_PER_LEVEL,
    streak: state.streak,
    waterToday: waterEntry ? waterEntry.count : 0,
    pomodoroSessionsToday: pomodoroToday,
  });
});

router.get("/achievements", (req, res) => {
  res.json(computeAchievements(db, req.userId));
});

router.post("/pomodoro/complete", (req, res) => {
  const { minutes, type, sessionId } = req.body || {};
  const mins = Number(minutes);
  if (!Number.isInteger(mins) || !["focus", "break"].includes(type)) {
    return res.status(400).json({ error: "Choose a valid focus or break session." });
  }
  const sessionType = type;
  const allowedMinutes = sessionType === "focus" ? [25, 50] : [5, 15];
  if (!allowedMinutes.includes(mins)) {
    return res.status(400).json({ error: "Use one of the available timer lengths." });
  }
  if (sessionType === "focus" && (typeof sessionId !== "string" || !/^[a-z0-9-]{8,80}$/i.test(sessionId))) {
    return res.status(400).json({ error: "A valid focus session ID is required." });
  }

  const state = getOrCreateUserState(db, req.userId);
  const existing = sessionType === "focus" && db.data.pomodoroSessions.find(
    (s) => s.userId === req.userId && s.clientSessionId === sessionId
  );
  if (existing) {
    if (existing.minutes !== mins || existing.type !== sessionType) {
      return res.status(409).json({ error: "This session ID was already used for a different timer." });
    }
    const today = todayKey();
    const sessionsToday = db.data.pomodoroSessions.filter(
      (s) => s.userId === req.userId && s.type === "focus" && s.completedAt.startsWith(today)
    ).length;
    return res.json({ session: existing, xp: state.xp, level: levelForXp(state.xp), leveledUp: false, streak: state.streak, sessionsToday, duplicate: true });
  }

  const session = {
    id: "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: req.userId,
    clientSessionId: sessionType === "focus" ? sessionId : undefined,
    minutes: mins,
    type: sessionType,
    completedAt: new Date().toISOString(),
  };
  db.data.pomodoroSessions.push(session);

  let leveledUp = false;

  if (sessionType === "focus") {
    const xpGain = xpForPomodoro(mins);
    const result = applyXp(state, xpGain);
    leveledUp = result.leveledUp;
    advanceStreak(state);
  }

  db.save();

  const today = todayKey();
  const sessionsToday = db.data.pomodoroSessions.filter(
    (s) => s.userId === req.userId && s.type === "focus" && s.completedAt.startsWith(today)
  ).length;

  res.status(201).json({
    session,
    xp: state.xp,
    level: levelForXp(state.xp),
    leveledUp,
    streak: state.streak,
    sessionsToday,
  });
});

router.post("/water", (req, res) => {
  const { count, date } = req.body || {};
  const day = date || todayKey();
  const c = Math.max(0, Math.min(8, Number(count) || 0));

  let entry = db.data.waterLogs.find((w) => w.userId === req.userId && w.date === day);
  if (entry) {
    entry.count = c;
  } else {
    entry = { id: "w_" + Date.now().toString(36), userId: req.userId, date: day, count: c };
    db.data.waterLogs.push(entry);
  }
  db.save();
  res.json({ date: day, count: entry.count });
});

export default router;
