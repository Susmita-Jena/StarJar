# StarJar

A cozy, gamified study app: tasks with XP, a Pomodoro focus timer, a Recharge
corner (mood, water, stretch, breathing exercise, memory-match game), and a
streak system (**Sync Rings**) — all skinnable across **6 complete themes**.

Landing page → sign up / log in → dashboard, all backed by a Node.js API with
per-user accounts and a storage adapter for local JSON or hosted PostgreSQL.

---

## Quick start

```bash
npm install
cp .env.example .env
```

Set a unique local `JWT_SECRET` in `.env`, then run:

```bash
npm start
```

Open **http://localhost:3000**. One process serves both the frontend and API,
so there is no separate frontend server or CORS setup to manage.

> Open the app via `http://localhost:3000`, not by double-clicking `app.html`.
> The app needs the server running to save anything; opening the HTML file
> directly (`file://...`) has nowhere to send its data.

### Vercel production setup

The Express API is already served by the Vercel Function in `api/[...path].js`;
you do not need to deploy a second API host. Vercel Functions cannot use the
project filesystem as a durable database, so production must use hosted
PostgreSQL. The app selects PostgreSQL when `DATABASE_URL` is configured. It
creates its tables and indexes automatically on the first database request.

1. In the Vercel project, connect a hosted PostgreSQL provider from the
   Marketplace (for example Neon) and use its pooled PostgreSQL connection URL.
   Do not commit the URL or paste it into source files.
2. In **Project Settings → Environment Variables**, make sure `DATABASE_URL`
   and a unique, random `JWT_SECRET` are set for **Production**. Add them for
   **Preview** too if you test preview deployments. `JWT_SECRET` must not be
   `dev-secret-change-me` or the placeholder from `.env.example`.
3. Redeploy after adding or changing either variable. Vercel applies environment
   variable changes only to new deployments.
4. Check `/api/health` on the new deployment. It should return `{"ok":true}`.
   Then test signup and login with a disposable account before sharing the site.

If either required setting is missing, production API requests fail with a clear
503 setup response; the app never falls back to a function-local file or `/tmp`
for user accounts. The local JSON file is ignored by Git and is only for local
development. It is not automatically copied into the hosted database; any local
accounts/data you need to preserve must be migrated separately before relying on
the new database.

## The 6 themes

Switchable anytime from the **Themes** tab inside the app (picked stays in
`localStorage`, so it's per-device, not per-account):

| Theme | Vibe | Display font |
|---|---|---|
| Storybook Journal | Warm paper, rose, marigold, sage — the default study questbook | Fraunces + DM Sans; DM Mono for numeric details |
| Classic Light | Dusty teal, mint, peach, sage — daylight-calm | Fraunces + DM Sans |
| Classic Dark | Navy, mauve, dusty blue — after hours | Fraunces + DM Sans |
| Cyberpunk | Neon violet/cyan on near-black — late-night deep focus | Courier New display + DM Sans |
| Dark Academia | Aged gold, burgundy, mahogany — library-coded | Fraunces + DM Sans |
| Softcore | Sunset amber, warm candlelight — cozy and unhurried | Fraunces + DM Sans |

The five original theme cards use their matching reference photos; Storybook
Journal uses a custom paper-and-sparkle treatment. Theme names, descriptions,
and optional image paths live in `public/app.js`.

Colors are CSS custom properties keyed off `data-theme` on `<body>` — see
the top of `public/style.css`. Adding a 7th theme means adding one more
`[data-theme="..."]` block with the same ~15 variables (`--bg`, `--surface`,
`--primary`, `--accent-info`, `--accent-ok`, `--accent-warn`, `--on-accent`,
etc.) and one entry in the `THEMES` array in `public/app.js`.

## Project structure

```
studysync/
├── dev-server.js          Local entry point — serves public/ and starts Express
├── server.js              Legacy placeholder; the app lives in lib/express-app.js
├── lib/express-app.js     Express app — mounts API routes and static/API middleware
├── db.js                  Chooses PostgreSQL for configured deployments or local JSON
├── lib/db-postgres.js     Hosted Postgres repository, schema and transactions
├── lib/db-json.js         Local-only JSON repository; ignored data is not deployed
├── lib/gamify.js          XP, level, streak, and achievement math
├── middleware/auth.js     JWT verification and existing-user check
├── routes/
│   ├── auth.js             register / login
│   ├── tasks.js            task CRUD (awards XP + streak on completion)
│   ├── mood.js             mood log (one entry per user/day)
│   └── state.js            /me, /state, Pomodoro completion, water, achievements
├── api/[...path].js       Vercel serverless API entrypoint
├── test/api.test.js       Isolated API regression tests (temporary JSON DB)
└── public/                Everything the browser loads
```

## Storage behavior

Without `DATABASE_URL`, non-production development uses `data/db.json`, which is
git-ignored. On Vercel or any production runtime, StarJar requires
`DATABASE_URL` and uses PostgreSQL instead; it never silently uses the JSON file.
All SQL calls are parameterized. User-owned records have foreign keys, moods and
water logs are unique per user/day, and task rewards and Pomodoro idempotency use
database transactions/constraints to protect updates from duplicate requests.

## API reference

All API routes except `/api/auth/*` and `/api/health` require
`Authorization: Bearer <token>`.

| Method | Path | Does |
|---|---|---|
| GET | `/api/health` | database and auth configuration readiness |
| POST | `/api/auth/register` | `{name, email, password}` → `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/api/me` | current user |
| GET | `/api/tasks` | your tasks |
| POST | `/api/tasks` | `{text, priority}` → new task |
| PATCH | `/api/tasks/:id` | `{done}` → updated task + xp/level/streak |
| DELETE | `/api/tasks/:id` | remove a task |
| GET | `/api/mood` | your mood history |
| POST | `/api/mood` | `{mood, color, note}` → upserts today's entry |
| GET | `/api/state` | xp, level, streak, water, sessions today |
| GET | `/api/achievements` | all 6 badges + unlocked status |
| POST | `/api/pomodoro/complete` | `{minutes, type, sessionId}` → xp/level/streak; focus requires a unique ID and supports 25/50 minutes, breaks support 5/15 |
| POST | `/api/water` | `{count}` → today's water count |

## Gamification rules (in `lib/gamify.js`)

- **XP**: low task = 10, mid = 20, high = 30. A focus session gives
  `round(minutes / 25 × 15)` XP — 25 min → 15 XP, 50 min → 30 XP.
- **Levels**: every 150 XP.
- **Streak**: advances once per calendar day the moment you complete a
  task or a focus session. Missing a day resets it to 1. Un-checking a
  task refunds the XP but never un-advances the streak — a day you showed
  up stays counted.
- **Achievements**: six badges, unlock conditions live in the
  `ACHIEVEMENTS` array in `lib/gamify.js` if you want to add more.

## Recharge activities

- **Breathing exercise** — box breathing, 4 seconds per phase (inhale →
  hold → exhale → hold), pure CSS transform/animation driven by a small
  JS phase timer. No backend involvement, no XP — it's meant to be a
  genuine break, not another thing to optimize.
- **Memory match** — 6 pairs of mood icons, reshuffle button. Also
  stakes-free by design.

Both live in `public/app.js` (search for `BREATHING EXERCISE` / `MEMORY MATCH
GAME`). To add more activities, follow the `.recharge-card` pattern in
`public/app.html` and add matching render/interaction logic in `public/app.js`.

## Notes on what's real vs. simplified

- Achievement unlocks are computed on request, not cached.
- Passwords are hashed with bcrypt, never stored in plain text. Tokens expire
  after 30 days.
- Theme choice is stored in `localStorage`, not the backend — it's a per-device
  preference, not account data, by design.

---

StarJar adds six selectable themes, including the Storybook Journal default, swaps
Study Room for a Recharge corner with two mini-games, and adds motion
throughout (task-complete bounce, level-up confetti burst, achievement
pop-in, breathing game animation).
