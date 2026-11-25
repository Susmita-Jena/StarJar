import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const appUrl = new URL("../lib/express-app.js", import.meta.url).href;
const smokeCode = `
  const { default: app } = await import(${JSON.stringify(appUrl)});
  const server = app.listen(0, "127.0.0.1", async () => {
    try {
      const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/health");
      console.log(JSON.stringify({ status: response.status, body: await response.json() }));
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      server.closeAllConnections?.();
      server.close();
    }
  });
`;

function checkProductionHealth({ jwtSecret }) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "starjar-prod-config-"));
  const jsonPath = path.join(cwd, "must-not-be-created", "db.json");
  const env = {
    ...process.env,
    NODE_ENV: "production",
    VERCEL: "1",
    STARJAR_JSON_DB_PATH: jsonPath,
  };
  delete env.DATABASE_URL;
  if (jwtSecret) env.JWT_SECRET = jwtSecret;
  else delete env.JWT_SECRET;

  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", smokeCode], {
      cwd,
      env,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = result.stdout.trim().split("\n").at(-1);
    return { result: JSON.parse(output), jsonWritten: existsSync(jsonPath) };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("production fails closed for missing secrets and never writes local JSON storage", () => {
  const noJwt = checkProductionHealth({ jwtSecret: null });
  assert.equal(noJwt.result.status, 503);
  assert.match(noJwt.result.body.error, /JWT_SECRET/i);
  assert.equal(noJwt.jsonWritten, false);

  for (const jwtSecret of ["change-this-to-a-unique-random-secret", "   "]) {
    const unsafeJwt = checkProductionHealth({ jwtSecret });
    assert.equal(unsafeJwt.result.status, 503);
    assert.match(unsafeJwt.result.body.error, /JWT_SECRET/i);
    assert.equal(unsafeJwt.jsonWritten, false);
  }

  const noDatabase = checkProductionHealth({ jwtSecret: "isolated-production-smoke-secret-only" });
  assert.equal(noDatabase.result.status, 503);
  assert.match(noDatabase.result.body.error, /DATABASE_URL/i);
  assert.equal(noDatabase.jsonWritten, false);
});
