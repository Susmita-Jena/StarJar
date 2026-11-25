// Local-only adapter. Production/Vercel never imports this file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyXp, advanceStreak, XP_PER_PRIORITY, xpForPomodoro } from "./gamify.js";
import { DuplicateEmailError, PomodoroConflictError } from "./db-errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "db.json");
const DB_PATH = process.env.STARJAR_JSON_DB_PATH || DEFAULT_DB_PATH;
const DEFAULT_DATA = {
  users: [],
  tasks: [],
  moods: [],
  pomodoroSessions: [],
  waterLogs: [],
  userState: [],
};

function loadData() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    for (const key of Object.keys(DEFAULT_DATA)) {
      if (!Array.isArray(data[key])) data[key] = [];
    }
    return data;
  } catch (error) {
    console.error("Could not read local StarJar JSON database:", error.message);
    return structuredClone(DEFAULT_DATA);
  }
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function dayWindow(day) {
  return day;
}

export function createJsonDb() {
  const data = loadData();
  let writeQueue = Promise.resolve();

  function save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  }

  function withWriteLock(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  function getOrCreateUserState(userId) {
    let state = data.userState.find((entry) => entry.userId === userId);
    let created = false;
    if (!state) {
      state = { userId, xp: 0, streak: 0, lastCompletionDate: null };
      data.userState.push(state);
      created = true;
    }
    return { state, created };
  }

  function sessionsToday(userId, day) {
    return data.pomodoroSessions.filter((session) =>
      session.userId === userId && session.type === "focus" && session.completedAt.startsWith(day)
    ).length;
  }

  return {
    async health() {
      return { ok: true, storage: "local-json" };
    },

    async getUserByEmail(email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      return clone(data.users.find((user) => user.email.toLowerCase() === normalizedEmail) || null);
    },

    async getUserById(userId) {
      return clone(data.users.find((user) => user.id === userId) || null);
    },

    async createUser(user) {
      return withWriteLock(() => {
        if (data.users.some((existing) => existing.email.toLowerCase() === user.email.toLowerCase())) {
          throw new DuplicateEmailError();
        }
        data.users.push(clone(user));
        data.userState.push({ userId: user.id, xp: 0, streak: 0, lastCompletionDate: null });
        save();
        return clone(user);
      });
    },

    async listTasks(userId) {
      return clone(data.tasks
        .filter((task) => task.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    },

    async createTask(task) {
      return withWriteLock(() => {
        data.tasks.push(clone(task));
        save();
        return clone(task);
      });
    },

    async updateTask(userId, taskId, changes) {
      return withWriteLock(() => {
        const task = data.tasks.find((entry) => entry.id === taskId && entry.userId === userId);
        if (!task) return null;
        const { state } = getOrCreateUserState(userId);
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
        save();
        return { task: clone(task), state: clone(state), leveledUp };
      });
    },

    async deleteTask(userId, taskId) {
      return withWriteLock(() => {
        const index = data.tasks.findIndex((entry) => entry.id === taskId && entry.userId === userId);
        if (index < 0) return false;
        data.tasks.splice(index, 1);
        save();
        return true;
      });
    },

    async listMoods(userId) {
      return clone(data.moods
        .filter((mood) => mood.userId === userId)
        .sort((a, b) => (a.date < b.date ? 1 : -1)));
    },

    async upsertMood(entry) {
      return withWriteLock(() => {
        let existing = data.moods.find((mood) => mood.userId === entry.userId && mood.date === entry.date);
        if (existing) {
          existing.mood = entry.mood;
          existing.color = entry.color || existing.color;
          existing.note = entry.note || "";
        } else {
          existing = clone(entry);
          data.moods.push(existing);
        }
        save();
        return clone(existing);
      });
    },

    async getDashboardState(userId, today) {
      return withWriteLock(() => {
        const { state, created } = getOrCreateUserState(userId);
        if (created) save();
        const water = data.waterLogs.find((entry) => entry.userId === userId && entry.date === dayWindow(today));
        return {
          state: clone(state),
          waterToday: water ? water.count : 0,
          pomodoroSessionsToday: sessionsToday(userId, today),
        };
      });
    },

    async getAchievementContext(userId) {
      return withWriteLock(() => {
        const { state, created } = getOrCreateUserState(userId);
        if (created) save();
        const focusSessions = data.pomodoroSessions.filter((session) => session.userId === userId && session.type === "focus");
        const waterLogs = data.waterLogs.filter((entry) => entry.userId === userId);
        return {
          tasksDone: data.tasks.filter((task) => task.userId === userId && task.done).length,
          streak: state.streak,
          longestFocusMinutes: focusSessions.reduce((maximum, session) => Math.max(maximum, session.minutes), 0),
          maxWaterInDay: waterLogs.reduce((maximum, entry) => Math.max(maximum, entry.count), 0),
          moodLogCount: data.moods.filter((entry) => entry.userId === userId).length,
        };
      });
    },

    async completePomodoro(input) {
      return withWriteLock(() => {
        const { userId, id, clientSessionId, minutes, type, completedAt, today } = input;
        const { state } = getOrCreateUserState(userId);
        const existing = type === "focus" && data.pomodoroSessions.find((session) =>
          session.userId === userId && session.clientSessionId === clientSessionId
        );
        if (existing) {
          if (existing.minutes !== minutes || existing.type !== type) throw new PomodoroConflictError();
          return {
            session: clone(existing), state: clone(state), leveledUp: false,
            sessionsToday: sessionsToday(userId, today), duplicate: true,
          };
        }

        const session = { id, userId, clientSessionId: type === "focus" ? clientSessionId : undefined, minutes, type, completedAt };
        data.pomodoroSessions.push(session);
        let leveledUp = false;
        if (type === "focus") {
          leveledUp = applyXp(state, xpForPomodoro(minutes)).leveledUp;
          advanceStreak(state);
        }
        save();
        return {
          session: clone(session), state: clone(state), leveledUp,
          sessionsToday: sessionsToday(userId, today), duplicate: false,
        };
      });
    },

    async setWater(userId, entry) {
      return withWriteLock(() => {
        let existing = data.waterLogs.find((water) => water.userId === userId && water.date === entry.date);
        if (existing) existing.count = entry.count;
        else {
          existing = { id: entry.id || makeId("w"), userId, date: entry.date, count: entry.count };
          data.waterLogs.push(existing);
        }
        save();
        return { date: existing.date, count: existing.count };
      });
    },
  };
}
