import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "starjar-api-test-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "starjar-test-secret-not-for-production";
process.env.STARJAR_JSON_DB_PATH = path.join(testDirectory, "db.json");
delete process.env.DATABASE_URL;
delete process.env.VERCEL;

let server;
let baseUrl;

before(async () => {
  const { default: app } = await import("../lib/express-app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

async function request(route, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

test("StarJar API persists account flows and isolates each user's study records", async () => {
  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.data.ok, true);

  const signup = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Test One", email: "one@example.invalid", password: "local-test-pass" },
  });
  assert.equal(signup.response.status, 201);
  assert.ok(signup.data.token);
  const firstToken = signup.data.token;
  const firstUser = signup.data.user;

  const duplicateSignup = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Duplicate", email: "ONE@example.invalid", password: "local-test-pass" },
  });
  assert.equal(duplicateSignup.response.status, 409);

  const failedLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "one@example.invalid", password: "wrong-password" },
  });
  assert.equal(failedLogin.response.status, 401);

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "ONE@example.invalid", password: "local-test-pass" },
  });
  assert.equal(login.response.status, 200);
  const me = await request("/api/me", { token: login.data.token });
  assert.equal(me.data.id, firstUser.id);

  const task = await request("/api/tasks", {
    token: firstToken,
    method: "POST",
    body: { text: "Read one chapter", priority: "high" },
  });
  assert.equal(task.response.status, 201);
  const completed = await request(`/api/tasks/${task.data.id}`, {
    token: firstToken,
    method: "PATCH",
    body: { done: true },
  });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.data.xp, 30);
  assert.equal(completed.data.streak, 1);

  const undone = await request(`/api/tasks/${task.data.id}`, {
    token: firstToken,
    method: "PATCH",
    body: { done: false },
  });
  assert.equal(undone.data.xp, 0);
  assert.equal(undone.data.streak, 1);

  const today = new Date().toISOString().slice(0, 10);
  const moodFirst = await request("/api/mood", {
    token: firstToken,
    method: "POST",
    body: { mood: "happy", color: "rose", note: "first", date: today },
  });
  const moodUpdate = await request("/api/mood", {
    token: firstToken,
    method: "POST",
    body: { mood: "okay", color: "sage", note: "updated", date: today },
  });
  assert.equal(moodFirst.response.status, 201);
  assert.equal(moodUpdate.data.id, moodFirst.data.id);
  const moods = await request("/api/mood", { token: firstToken });
  assert.equal(moods.data.length, 1);

  const fractionalWater = await request("/api/water", {
    token: firstToken,
    method: "POST",
    body: { count: 2.5, date: today },
  });
  assert.equal(fractionalWater.data.count, 2);
  const water = await request("/api/water", {
    token: firstToken,
    method: "POST",
    body: { count: 11, date: today },
  });
  assert.equal(water.data.count, 8);

  const focusBody = { minutes: 25, type: "focus", sessionId: "test-session-0001" };
  const focus = await request("/api/pomodoro/complete", { token: firstToken, method: "POST", body: focusBody });
  assert.equal(focus.response.status, 201);
  assert.equal(focus.data.xp, 15);
  const duplicateFocus = await request("/api/pomodoro/complete", { token: firstToken, method: "POST", body: focusBody });
  assert.equal(duplicateFocus.response.status, 200);
  assert.equal(duplicateFocus.data.duplicate, true);
  assert.equal(duplicateFocus.data.xp, 15);
  const conflictingFocus = await request("/api/pomodoro/complete", {
    token: firstToken,
    method: "POST",
    body: { ...focusBody, minutes: 50 },
  });
  assert.equal(conflictingFocus.response.status, 409);

  const achievements = await request("/api/achievements", { token: firstToken });
  assert.equal(achievements.data.find((item) => item.id === "hydrated-mind").unlocked, true);

  const secondSignup = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Test Two", email: "two@example.invalid", password: "local-test-pass" },
  });
  assert.equal(secondSignup.response.status, 201);
  const secondTasks = await request("/api/tasks", { token: secondSignup.data.token });
  const secondMoods = await request("/api/mood", { token: secondSignup.data.token });
  const secondState = await request("/api/state", { token: secondSignup.data.token });
  assert.equal(secondTasks.data.length, 0);
  assert.equal(secondMoods.data.length, 0);
  assert.equal(secondState.data.xp, 0);
  assert.equal(secondState.data.waterToday, 0);
});

test("frontend shows auth endpoint errors and still clears expired protected sessions", async () => {
  const values = new Map();
  let nextResponse = {
    status: 401,
    ok: false,
    json: async () => ({ error: "No account found with that email." }),
  };
  const context = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    window: {},
    fetch: async () => nextResponse,
  };
  const source = fs.readFileSync(new URL("../public/api.js", import.meta.url), "utf8");
  vm.runInNewContext(source, context);

  await assert.rejects(
    context.window.studySyncApi.login("missing@example.invalid", "test-password"),
    (error) => error.message === "No account found with that email."
  );

  values.set("studysync_token", "expired-token");
  nextResponse = { status: 401, ok: false, json: async () => ({ error: "Unauthorized." }) };
  await assert.rejects(
    context.window.studySyncApi.me(),
    (error) => error.message === "Session expired" && error.isAuthError === true
  );
  assert.equal(values.has("studysync_token"), false);
});
