// routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { JWT_SECRET, AUTH_CONFIGURATION_ERROR } from "../middleware/auth.js";
import { asyncHandler } from "../lib/async-handler.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

router.post("/register", asyncHandler(async (req, res) => {
  if (!JWT_SECRET) return res.status(503).json({ error: AUTH_CONFIGURATION_ERROR });
  const { name, email, password } = req.body || {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!cleanName) return res.status(400).json({ error: "Name is required." });
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password needs to be at least 6 characters." });
  }

  const user = {
    id: "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: cleanName,
    email: cleanEmail,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  };

  try {
    await db.createUser(user);
  } catch (error) {
    if (error.code === "DUPLICATE_EMAIL") {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    throw error;
  }

  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  if (!JWT_SECRET) return res.status(503).json({ error: AUTH_CONFIGURATION_ERROR });
  const { email, password } = req.body || {};
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "Enter both email and password." });
  }

  const user = await db.getUserByEmail(cleanEmail);
  if (!user) return res.status(401).json({ error: "No account found with that email." });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect password." });

  res.json({ token: signToken(user.id), user: publicUser(user) });
}));

export default router;
