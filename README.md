# StarJar

A cozy, gamified study app: tasks with XP, a Pomodoro focus timer, a Recharge
corner (mood, water, stretch, breathing exercise, memory-match game), and a
streak system (**Sync Rings**) — all skinnable across **6 complete themes**.

Landing page → sign up / log in → dashboard, all backed by a real Node.js
API with per-user accounts.

---

## Quick start

```bash
npm install
cp .env.example .env
npm start
```

Then open **http://localhost:3000** in your browser. That's it — one
process serves both the frontend and the API, so there's no separate
frontend server to run and no CORS setup needed.

> Open it via `http://localhost:3000`, not by double-clicking `app.html`.
> The app needs the server running to save anything — opening the HTML
> file directly (`file://...`) has nowhere to send your data.

### Before you deploy or share this anywhere

Open `.env` and change `JWT_SECRET` to a long random string — that's what
signs everyone's login tokens. The placeholder value is fine for playing
around locally, but not for anything real.

The JSON-file database in this repository is for local or small-group use
only. It is not durable shared storage on Vercel/serverless hosting: function
instances can be read-only, restart independently, or lose local writes.
Before using this deployment for real multi-user accounts, connect a persistent
shared database and adapt `db.js`; a `JWT_SECRET` alone does not make serverless
data durable.

---

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
├── db.js                  Tiny JSON-file "database" (see note below)
├── lib/gamify.js           XP, level, streak, and achievement math — all in one place
├── middleware/auth.js      JWT verification
├── routes/
│   ├── auth.js             register / login
│   ├── tasks.js             task CRUD (awards XP + streak on completion)
│   ├── mood.js               mood log (one entry per day, upserted)
│   └── state.js               /me, /state, pomodoro completion, water, achievements
├── data/db.json            Created automatically on first run — local app data
└── public/                  Everything the browser loads
    ├── index.html            landing page served at /, includes theme showcase
    ├── auth.html              login / signup (fixed Classic Dark)
    ├── app.html                dashboard: Tasks / Timer / Recharge / Progress / Themes
    ├── style.css               one shared stylesheet — all 6 themes + all pages
    ├── rings.js                 renders the Sync Rings streak visual, theme-aware
    ├── api.js                    fetch wrapper for every backend call
    ├── app.js, auth.js            dashboard and account behavior (including Recharge games)
    ├── favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest
    └── images/
        ├── logo.png, logo-small.png       legacy image assets; the app chrome now uses a text-only StarJar wordmark
        ├── theme-*.jpg (×5)                reference photos for the five original themes
        └── moods/*.jpg (×6)                 happy / sad / okay / satire / lovely / melancholic
```

## Why a JSON file instead of a real database?

`db.js` reads `data/db.json` into memory on startup and writes it back to
disk after every change — no ORM, no native dependencies to compile.
That last part matters more than it sounds: packages like `better-sqlite3`
need native build tools, which is exactly the kind of thing that turns into
an afternoon of PowerShell/PATH pain on Windows. `express`, `cors`,
`bcryptjs`, and `jsonwebtoken` are all pure JavaScript, so `npm install`
just works.

The tradeoff is real — this won't hold up under many concurrent users. If
you ever want to scale this past personal/small-group use, every route
only touches `db.data.*` arrays and calls `db.save()`, so swapping in a
real database means rewriting `db.js`, not the rest of the app.

## API reference

All API routes except `/api/auth/*` require `Authorization: Bearer <token>`.

| Method | Path | Does |
|---|---|---|
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

- **Achievement unlocks** are computed on request, not cached — fine at
  this scale, would want indexing at real scale.
- Passwords are hashed with bcrypt, never stored in plain text. Tokens
  expire after 30 days.
- Theme choice is stored in `localStorage`, not the backend — it's a
  per-device preference, not account data, by design.

---

StarJar adds six selectable themes, including the Storybook Journal default, swaps
Study Room for a Recharge corner with two mini-games, and adds motion
throughout (task-complete bounce, level-up confetti burst, achievement
pop-in, breathing game animation).
