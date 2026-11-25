// middleware/auth.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { db } from "../db.js";

dotenv.config();

const DEVELOPMENT_SECRET = "dev-secret-change-me";
const INSECURE_PRODUCTION_SECRETS = new Set([
  DEVELOPMENT_SECRET,
  "change-this-to-a-unique-random-secret",
]);
const isProductionRuntime = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const configuredSecret = process.env.JWT_SECRET?.trim();
const validProductionSecret = Boolean(configuredSecret && !INSECURE_PRODUCTION_SECRETS.has(configuredSecret));

export const JWT_SECRET = isProductionRuntime
  ? (validProductionSecret ? configuredSecret : null)
  : (configuredSecret || DEVELOPMENT_SECRET);
export const AUTH_CONFIGURATION_ERROR = "StarJar authentication is not configured. Set JWT_SECRET for this deployment and redeploy.";
export const hasValidJwtSecret = () => Boolean(JWT_SECRET);

export function requireAuth(req, res, next) {
  if (!JWT_SECRET) return res.status(503).json({ error: AUTH_CONFIGURATION_ERROR });

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in." });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Session expired — log in again." });
  }

  db.getUserById(payload.userId).then((user) => {
    if (!user) return res.status(401).json({ error: "Session expired — log in again." });
    req.userId = user.id;
    return next();
  }).catch(next);
}
