// middleware/auth.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const DEVELOPMENT_SECRET = "dev-secret-change-me";
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEVELOPMENT_SECRET)) {
  throw new Error("JWT_SECRET must be configured to a unique, random value in production.");
}
const JWT_SECRET = process.env.JWT_SECRET || DEVELOPMENT_SECRET;

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not logged in." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired — log in again." });
  }
}

export { JWT_SECRET };
