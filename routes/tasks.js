// routes/tasks.js
import { Router } from "express";
import { db } from "../db.js";
import { XP_PER_PRIORITY, levelForXp } from "../lib/gamify.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();
const VALID_PRIORITIES = ["low", "mid", "high"];

router.get("/", asyncHandler(async (req, res) => {
  res.json(await db.listTasks(req.userId));
}));

router.post("/", asyncHandler(async (req, res) => {
  const { text, priority } = req.body || {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Task text can't be empty." });
  }
  const task = {
    id: "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: req.userId,
    text: text.trim(),
    priority: VALID_PRIORITIES.includes(priority) ? priority : "mid",
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  res.status(201).json(await db.createTask(task));
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const { done, text, priority } = req.body || {};
  const result = await db.updateTask(req.userId, req.params.id, { done, text, priority });
  if (!result) return res.status(404).json({ error: "Task not found." });
  res.json({
    task: result.task,
    xp: result.state.xp,
    level: levelForXp(result.state.xp),
    leveledUp: result.leveledUp,
    streak: result.state.streak,
  });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await db.deleteTask(req.userId, req.params.id);
  if (!deleted) return res.status(404).json({ error: "Task not found." });
  res.json({ ok: true });
}));

export default router;
