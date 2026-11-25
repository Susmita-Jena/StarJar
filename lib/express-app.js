// lib/express-app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { requireAuth, hasValidJwtSecret, AUTH_CONFIGURATION_ERROR } from "../middleware/auth.js";
import { db } from "../db.js";
import { DatabaseConfigurationError } from "./db-errors.js";
import { asyncHandler } from "./async-handler.js";
import authRoutes from "../routes/auth.js";
import taskRoutes from "../routes/tasks.js";
import moodRoutes from "../routes/mood.js";
import stateRoutes from "../routes/state.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", asyncHandler(async (req, res) => {
  if (!hasValidJwtSecret()) {
    return res.status(503).json({ ok: false, error: AUTH_CONFIGURATION_ERROR });
  }
  await db.health();
  res.json({ ok: true });
}));

app.use("/api/auth", authRoutes);
app.use("/api/tasks", requireAuth, taskRoutes);
app.use("/api/mood", requireAuth, moodRoutes);
app.use("/api", requireAuth, stateRoutes);

app.use((req, res, next) => {
  if (req.path === "/api" || req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found." });
  }
  return next();
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof DatabaseConfigurationError || error.code === "DATABASE_NOT_CONFIGURED") {
    return res.status(503).json({
      error: "StarJar storage is not configured for this deployment. Add DATABASE_URL in the deployment environment and redeploy.",
    });
  }
  console.error("StarJar API error", error.code || "", error.message || "Unknown error");
  return res.status(500).json({ error: "A StarJar server error occurred. Please try again shortly." });
});

export default app;
