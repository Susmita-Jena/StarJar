// routes/mood.js
import { Router } from "express";
import { db } from "../db.js";
import { todayKey } from "../lib/gamify.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();
const VALID_MOODS = ["happy", "sad", "okay", "satire", "lovely", "melancholic"];

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get("/", asyncHandler(async (req, res) => {
  res.json(await db.listMoods(req.userId));
}));

router.post("/", asyncHandler(async (req, res) => {
  const { mood, color, note, date } = req.body || {};
  if (!VALID_MOODS.includes(mood)) {
    return res.status(400).json({ error: "Pick a valid mood option." });
  }
  const day = date || todayKey();
  if (!isDateKey(day)) return res.status(400).json({ error: "Choose a valid calendar date." });

  const entry = {
    id: "m_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: req.userId,
    date: day,
    mood,
    color: typeof color === "string" && color ? color : "periwinkle",
    note: typeof note === "string" ? note : "",
    createdAt: new Date().toISOString(),
  };
  res.status(201).json(await db.upsertMood(entry));
}));

export default router;
