// routes/state.js
import { Router } from "express";
import { db } from "../db.js";
import {
  levelForXp,
  xpIntoLevel,
  todayKey,
  computeAchievements,
  XP_PER_LEVEL,
} from "../lib/gamify.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get("/me", asyncHandler(async (req, res) => {
  const user = await db.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ id: user.id, name: user.name, email: user.email });
}));

router.get("/state", asyncHandler(async (req, res) => {
  const result = await db.getDashboardState(req.userId, todayKey());
  const state = result.state;
  res.json({
    xp: state.xp,
    level: levelForXp(state.xp),
    xpIntoLevel: xpIntoLevel(state.xp),
    xpForNextLevel: XP_PER_LEVEL,
    streak: state.streak,
    waterToday: result.waterToday,
    pomodoroSessionsToday: result.pomodoroSessionsToday,
  });
}));

router.get("/achievements", asyncHandler(async (req, res) => {
  res.json(computeAchievements(await db.getAchievementContext(req.userId)));
}));

router.post("/pomodoro/complete", asyncHandler(async (req, res) => {
  const { minutes, type, sessionId } = req.body || {};
  const mins = Number(minutes);
  if (!Number.isInteger(mins) || !["focus", "break"].includes(type)) {
    return res.status(400).json({ error: "Choose a valid focus or break session." });
  }
  const allowedMinutes = type === "focus" ? [25, 50] : [5, 15];
  if (!allowedMinutes.includes(mins)) {
    return res.status(400).json({ error: "Use one of the available timer lengths." });
  }
  if (type === "focus" && (typeof sessionId !== "string" || !/^[a-z0-9-]{8,80}$/i.test(sessionId))) {
    return res.status(400).json({ error: "A valid focus session ID is required." });
  }

  try {
    const result = await db.completePomodoro({
      id: "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: req.userId,
      clientSessionId: type === "focus" ? sessionId : null,
      minutes: mins,
      type,
      completedAt: new Date().toISOString(),
      today: todayKey(),
    });
    const response = {
      session: result.session,
      xp: result.state.xp,
      level: levelForXp(result.state.xp),
      leveledUp: result.leveledUp,
      streak: result.state.streak,
      sessionsToday: result.sessionsToday,
    };
    if (result.duplicate) response.duplicate = true;
    res.status(result.duplicate ? 200 : 201).json(response);
  } catch (error) {
    if (error.code === "POMODORO_SESSION_CONFLICT") {
      return res.status(409).json({ error: "This session ID was already used for a different timer." });
    }
    throw error;
  }
}));

router.post("/water", asyncHandler(async (req, res) => {
  const { count, date } = req.body || {};
  const day = date || todayKey();
  if (!isDateKey(day)) return res.status(400).json({ error: "Choose a valid calendar date." });
  const numericCount = Number(count) || 0;
  const safeCount = Math.max(0, Math.min(8, Math.trunc(numericCount)));
  const result = await db.setWater(req.userId, {
    id: "w_" + Date.now().toString(36),
    date: day,
    count: safeCount,
  });
  res.json(result);
}));

export default router;
