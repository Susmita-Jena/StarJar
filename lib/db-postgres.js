import pg from "pg";
import { applyXp, advanceStreak, XP_PER_PRIORITY, xpForPomodoro } from "./gamify.js";
import { DuplicateEmailError, PomodoroConflictError } from "./db-errors.js";

const { Pool } = pg;
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS user_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  last_completion_date DATE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'mid', 'high')),
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_user_created_idx ON tasks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  mood TEXT NOT NULL CHECK (mood IN ('happy', 'sad', 'okay', 'satire', 'lovely', 'melancholic')),
  color TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, entry_date)
);
CREATE INDEX IF NOT EXISTS moods_user_date_idx ON moods (user_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_session_id TEXT,
  minutes SMALLINT NOT NULL CHECK (minutes IN (5, 15, 25, 50)),
  type TEXT NOT NULL CHECK (type IN ('focus', 'break')),
  completed_at TIMESTAMPTZ NOT NULL,
  CHECK ((type = 'focus' AND minutes IN (25, 50)) OR (type = 'break' AND minutes IN (5, 15)))
);
CREATE UNIQUE INDEX IF NOT EXISTS pomodoro_focus_session_unique
  ON pomodoro_sessions (user_id, client_session_id)
  WHERE client_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pomodoro_user_completed_idx ON pomodoro_sessions (user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS water_logs (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  count SMALLINT NOT NULL CHECK (count BETWEEN 0 AND 8),
  PRIMARY KEY (user_id, entry_date)
);
`;

function iso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateOnly(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapUser(row) {
  return row && {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: iso(row.created_at),
  };
}

function mapState(row) {
  return {
    userId: row.user_id,
    xp: Number(row.xp),
    streak: Number(row.streak),
    lastCompletionDate: dateOnly(row.last_completion_date),
  };
}

function mapTask(row) {
  return row && {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    priority: row.priority,
    done: row.done,
    createdAt: iso(row.created_at),
    completedAt: iso(row.completed_at),
  };
}

function mapMood(row) {
  return row && {
    id: row.id,
    userId: row.user_id,
    date: dateOnly(row.entry_date),
    mood: row.mood,
    color: row.color,
    note: row.note,
    createdAt: iso(row.created_at),
  };
}

function mapSession(row) {
  return row && {
    id: row.id,
    userId: row.user_id,
    ...(row.client_session_id ? { clientSessionId: row.client_session_id } : {}),
    minutes: Number(row.minutes),
    type: row.type,
    completedAt: iso(row.completed_at),
  };
}

function utcWindow(day) {
  const start = new Date(`${day}T00:00:00.000Z`);
  return [start, new Date(start.getTime() + 24 * 60 * 60 * 1000)];
}

export function createPostgresDb(connectionString, { PoolClass = Pool } = {}) {
  const pool = new PoolClass({
    connectionString,
    max: Number(process.env.PG_POOL_MAX) > 0 ? Math.min(Number(process.env.PG_POOL_MAX), 5) : 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  let schemaPromise;

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(SCHEMA_SQL).catch((error) => {
        schemaPromise = undefined;
        throw error;
      });
    }
    await schemaPromise;
  }

  async function query(sql, values = []) {
    await ensureSchema();
    return pool.query(sql, values);
  }

  async function transaction(operation) {
    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function getOrCreateState(client, userId, forUpdate = false) {
    await client.query(
      "INSERT INTO user_states (user_id, xp, streak, last_completion_date) VALUES ($1, 0, 0, NULL) ON CONFLICT (user_id) DO NOTHING",
      [userId]
    );
    const suffix = forUpdate ? " FOR UPDATE" : "";
    const result = await client.query(`SELECT user_id, xp, streak, last_completion_date FROM user_states WHERE user_id = $1${suffix}`, [userId]);
    return mapState(result.rows[0]);
  }

  async function countFocusSessions(client, userId, day) {
    const [start, end] = utcWindow(day);
    const result = await client.query(
      "SELECT COUNT(*)::int AS count FROM pomodoro_sessions WHERE user_id = $1 AND type = 'focus' AND completed_at >= $2 AND completed_at < $3",
      [userId, start, end]
    );
    return Number(result.rows[0].count);
  }

  async function updateState(client, state) {
    await client.query(
      "UPDATE user_states SET xp = $2, streak = $3, last_completion_date = $4 WHERE user_id = $1",
      [state.userId, state.xp, state.streak, state.lastCompletionDate]
    );
  }

  return {
    async health() {
      await ensureSchema();
      await pool.query("SELECT 1");
      return { ok: true, storage: "postgres" };
    },

    async getUserByEmail(email) {
      const result = await query("SELECT id, name, email, password_hash, created_at FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [String(email).trim()]);
      return mapUser(result.rows[0]);
    },

    async getUserById(userId) {
      const result = await query("SELECT id, name, email, password_hash, created_at FROM users WHERE id = $1", [userId]);
      return mapUser(result.rows[0]);
    },

    async createUser(user) {
      try {
        await transaction(async (client) => {
          await client.query(
            "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
            [user.id, user.name, user.email, user.passwordHash, user.createdAt]
          );
          await client.query(
            "INSERT INTO user_states (user_id, xp, streak, last_completion_date) VALUES ($1, 0, 0, NULL)",
            [user.id]
          );
        });
      } catch (error) {
        if (error.code === "23505" && error.constraint === "users_email_lower_unique") throw new DuplicateEmailError();
        throw error;
      }
      return user;
    },

    async listTasks(userId) {
      const result = await query(
        "SELECT id, user_id, text, priority, done, created_at, completed_at FROM tasks WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      return result.rows.map(mapTask);
    },

    async createTask(task) {
      const result = await query(
        "INSERT INTO tasks (id, user_id, text, priority, done, created_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, user_id, text, priority, done, created_at, completed_at",
        [task.id, task.userId, task.text, task.priority, task.done, task.createdAt, task.completedAt]
      );
      return mapTask(result.rows[0]);
    },

    async updateTask(userId, taskId, changes) {
      return transaction(async (client) => {
        const found = await client.query(
          "SELECT id, user_id, text, priority, done, created_at, completed_at FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [taskId, userId]
        );
        if (!found.rows[0]) return null;
        const task = mapTask(found.rows[0]);
        const state = await getOrCreateState(client, userId, true);
        let leveledUp = false;

        if (typeof changes.done === "boolean" && changes.done !== task.done) {
          const delta = XP_PER_PRIORITY[task.priority] || XP_PER_PRIORITY.mid;
          if (changes.done) {
            task.done = true;
            task.completedAt = new Date().toISOString();
            leveledUp = applyXp(state, delta).leveledUp;
            advanceStreak(state);
          } else {
            task.done = false;
            task.completedAt = null;
            applyXp(state, -delta);
          }
        }
        if (typeof changes.text === "string" && changes.text.trim()) task.text = changes.text.trim();
        if (["low", "mid", "high"].includes(changes.priority)) task.priority = changes.priority;

        const updated = await client.query(
          "UPDATE tasks SET text = $3, priority = $4, done = $5, completed_at = $6 WHERE id = $1 AND user_id = $2 RETURNING id, user_id, text, priority, done, created_at, completed_at",
          [taskId, userId, task.text, task.priority, task.done, task.completedAt]
        );
        await updateState(client, state);
        return { task: mapTask(updated.rows[0]), state, leveledUp };
      });
    },

    async deleteTask(userId, taskId) {
      const result = await query("DELETE FROM tasks WHERE id = $1 AND user_id = $2", [taskId, userId]);
      return result.rowCount > 0;
    },

    async listMoods(userId) {
      const result = await query(
        "SELECT id, user_id, entry_date, mood, color, note, created_at FROM moods WHERE user_id = $1 ORDER BY entry_date DESC",
        [userId]
      );
      return result.rows.map(mapMood);
    },

    async upsertMood(entry) {
      const result = await query(
        `INSERT INTO moods (id, user_id, entry_date, mood, color, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, entry_date) DO UPDATE
           SET mood = EXCLUDED.mood, color = EXCLUDED.color, note = EXCLUDED.note
         RETURNING id, user_id, entry_date, mood, color, note, created_at`,
        [entry.id, entry.userId, entry.date, entry.mood, entry.color, entry.note, entry.createdAt]
      );
      return mapMood(result.rows[0]);
    },

    async getDashboardState(userId, today) {
      const state = await transaction((client) => getOrCreateState(client, userId));
      const [waterResult, focusCount] = await Promise.all([
        query("SELECT count FROM water_logs WHERE user_id = $1 AND entry_date = $2", [userId, today]),
        countFocusSessions(pool, userId, today),
      ]);
      return {
        state,
        waterToday: waterResult.rows[0] ? Number(waterResult.rows[0].count) : 0,
        pomodoroSessionsToday: focusCount,
      };
    },

    async getAchievementContext(userId) {
      const state = await transaction((client) => getOrCreateState(client, userId));
      const result = await query(
        `SELECT
          (SELECT COUNT(*)::int FROM tasks WHERE user_id = $1 AND done = TRUE) AS tasks_done,
          (SELECT COALESCE(MAX(minutes), 0)::int FROM pomodoro_sessions WHERE user_id = $1 AND type = 'focus') AS longest_focus_minutes,
          (SELECT COALESCE(MAX(count), 0)::int FROM water_logs WHERE user_id = $1) AS max_water_in_day,
          (SELECT COUNT(*)::int FROM moods WHERE user_id = $1) AS mood_log_count`,
        [userId]
      );
      const row = result.rows[0];
      return {
        tasksDone: Number(row.tasks_done),
        streak: state.streak,
        longestFocusMinutes: Number(row.longest_focus_minutes),
        maxWaterInDay: Number(row.max_water_in_day),
        moodLogCount: Number(row.mood_log_count),
      };
    },

    async completePomodoro(input) {
      return transaction(async (client) => {
        const state = await getOrCreateState(client, input.userId, true);
        if (input.type === "focus") {
          const existingResult = await client.query(
            "SELECT id, user_id, client_session_id, minutes, type, completed_at FROM pomodoro_sessions WHERE user_id = $1 AND client_session_id = $2",
            [input.userId, input.clientSessionId]
          );
          const existing = existingResult.rows[0];
          if (existing) {
            const session = mapSession(existing);
            if (session.minutes !== input.minutes || session.type !== input.type) throw new PomodoroConflictError();
            return {
              session, state, leveledUp: false,
              sessionsToday: await countFocusSessions(client, input.userId, input.today), duplicate: true,
            };
          }
        }

        const inserted = await client.query(
          `INSERT INTO pomodoro_sessions (id, user_id, client_session_id, minutes, type, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ${input.type === "focus" ? "ON CONFLICT DO NOTHING" : ""}
           RETURNING id, user_id, client_session_id, minutes, type, completed_at`,
          [input.id, input.userId, input.type === "focus" ? input.clientSessionId : null, input.minutes, input.type, input.completedAt]
        );
        if (!inserted.rows[0] && input.type === "focus") {
          const existingResult = await client.query(
            "SELECT id, user_id, client_session_id, minutes, type, completed_at FROM pomodoro_sessions WHERE user_id = $1 AND client_session_id = $2",
            [input.userId, input.clientSessionId]
          );
          const existing = existingResult.rows[0];
          if (!existing) throw new Error("Focus session insert was ignored without a matching idempotency record.");
          const session = mapSession(existing);
          if (session.minutes !== input.minutes || session.type !== input.type) throw new PomodoroConflictError();
          return {
            session, state, leveledUp: false,
            sessionsToday: await countFocusSessions(client, input.userId, input.today), duplicate: true,
          };
        }
        let leveledUp = false;
        if (input.type === "focus") {
          leveledUp = applyXp(state, xpForPomodoro(input.minutes)).leveledUp;
          advanceStreak(state);
          await updateState(client, state);
        }
        return {
          session: mapSession(inserted.rows[0]), state, leveledUp,
          sessionsToday: await countFocusSessions(client, input.userId, input.today), duplicate: false,
        };
      });
    },

    async setWater(userId, entry) {
      await query(
        `INSERT INTO water_logs (id, user_id, entry_date, count)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, entry_date) DO UPDATE SET count = EXCLUDED.count`,
        [entry.id, userId, entry.date, entry.count]
      );
      return { date: entry.date, count: entry.count };
    },
  };
}
