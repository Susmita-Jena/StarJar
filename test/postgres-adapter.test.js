import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { createPostgresDb } from "../lib/db-postgres.js";

const memoryServer = newDb();
const { Pool: MemoryPool } = memoryServer.adapters.createPg();
const db = createPostgresDb("postgres://localhost/starjar", { PoolClass: MemoryPool });

const firstUser = {
  id: "u_pg_test_1",
  name: "Postgres Test",
  email: "pg-test@example.invalid",
  passwordHash: "test-hash",
  createdAt: new Date().toISOString(),
};

test("Postgres adapter initializes schema and preserves user data and rewards", async () => {
  assert.deepEqual(await db.health(), { ok: true, storage: "postgres" });
  await db.createUser(firstUser);
  assert.equal((await db.getUserByEmail("PG-TEST@example.invalid")).id, firstUser.id);

  await assert.rejects(
    () => db.createUser({ ...firstUser, id: "u_pg_test_duplicate", email: firstUser.email.toUpperCase() }),
    (error) => /duplicate key|unique constraint/i.test(error.message)
  );

  const task = await db.createTask({
    id: "t_pg_test_1",
    userId: firstUser.id,
    text: "Persist my quest",
    priority: "high",
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });
  assert.equal(task.text, "Persist my quest");
  assert.equal((await db.listTasks(firstUser.id)).length, 1);

  const taskUpdate = await db.updateTask(firstUser.id, task.id, { done: true });
  assert.equal(taskUpdate.task.done, true);
  assert.equal(taskUpdate.state.xp, 30);
  assert.equal(taskUpdate.state.streak, 1);

  const today = new Date().toISOString().slice(0, 10);
  const moodBase = {
    id: "m_pg_test_1",
    userId: firstUser.id,
    date: today,
    mood: "happy",
    color: "rose",
    note: "first",
    createdAt: new Date().toISOString(),
  };
  const insertedMood = await db.upsertMood(moodBase);
  const updatedMood = await db.upsertMood({ ...moodBase, id: "m_pg_test_2", mood: "okay", note: "updated" });
  assert.equal(updatedMood.id, insertedMood.id);
  assert.equal((await db.listMoods(firstUser.id)).length, 1);
  assert.equal((await db.listMoods(firstUser.id))[0].mood, "okay");

  await db.setWater(firstUser.id, { id: "w_pg_test_1", date: today, count: 8 });
  const dashboard = await db.getDashboardState(firstUser.id, today);
  assert.equal(dashboard.state.xp, 30);
  assert.equal(dashboard.waterToday, 8);

  const focusInput = {
    id: "p_pg_test_1",
    userId: firstUser.id,
    clientSessionId: "focus-session-0001",
    minutes: 25,
    type: "focus",
    completedAt: new Date().toISOString(),
    today,
  };
  const focus = await db.completePomodoro(focusInput);
  assert.equal(focus.state.xp, 45);
  assert.equal(focus.sessionsToday, 1);
  const duplicateFocus = await db.completePomodoro({ ...focusInput, id: "p_pg_test_duplicate" });
  assert.equal(duplicateFocus.duplicate, true);
  assert.equal(duplicateFocus.state.xp, 45);

  const concurrentInput = { ...focusInput, id: "p_pg_test_concurrent_1", clientSessionId: "focus-session-concurrent-1" };
  const concurrentResults = await Promise.all([
    db.completePomodoro(concurrentInput),
    db.completePomodoro({ ...concurrentInput, id: "p_pg_test_concurrent_2" }),
  ]);
  assert.equal(concurrentResults.filter((result) => result.duplicate).length, 1);
  assert.equal((await db.getDashboardState(firstUser.id, today)).state.xp, 60);

  const achievements = await db.getAchievementContext(firstUser.id);
  assert.equal(achievements.tasksDone, 1);
  assert.equal(achievements.longestFocusMinutes, 25);
  assert.equal(achievements.maxWaterInDay, 8);
  assert.equal(achievements.moodLogCount, 1);

  const secondUser = { ...firstUser, id: "u_pg_test_2", email: "pg-test-2@example.invalid" };
  await db.createUser(secondUser);
  assert.equal((await db.listTasks(secondUser.id)).length, 0);
  assert.equal((await db.listMoods(secondUser.id)).length, 0);
  const secondDashboard = await db.getDashboardState(secondUser.id, today);
  assert.equal(secondDashboard.state.xp, 0);
  assert.equal(secondDashboard.waterToday, 0);
});
