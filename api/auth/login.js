// Explicit Vercel function route for the login endpoint.
// Keep the shared Express application as the single source of auth logic.
import app from "../../lib/express-app.js";

export default app;
