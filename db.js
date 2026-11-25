// Select durable storage for hosted deployments and a local-only adapter for development.
// Importing the local adapter is intentionally avoided on Vercel/production so it never
// attempts to create or write data/db.json in the read-only function bundle.
import "dotenv/config";
import { DatabaseConfigurationError } from "./lib/db-errors.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
const isHostedProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

let db;
if (databaseUrl) {
  const { createPostgresDb } = await import("./lib/db-postgres.js");
  db = createPostgresDb(databaseUrl);
} else if (isHostedProduction) {
  const fail = async () => {
    throw new DatabaseConfigurationError(
      "StarJar storage is not configured. Add DATABASE_URL to this Vercel environment and redeploy."
    );
  };
  db = new Proxy({ health: fail }, {
    get(target, property) {
      if (property in target) return target[property];
      return fail;
    },
  });
} else {
  const { createJsonDb } = await import("./lib/db-json.js");
  db = createJsonDb();
}

export { db };
