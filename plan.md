# StarJar repair and whimsical polish plan

## Goal and scope
Preserve the existing vanilla HTML/CSS/JavaScript frontend, Express API, and Vercel serverless entrypoint. Migrate account and study-progress persistence from the JSON file to hosted PostgreSQL, keeping the JSON adapter only for local development. Preserve existing API paths, payloads, auth behavior, gamification rules, and all six themes. Do not provision external services or write production secrets from this environment; document the exact Vercel setup the owner must complete.

## Implementation approach
- Keep the existing routes and frontend behavior. Replace direct route access to synchronous `db.data.*` arrays with an asynchronous repository interface shared by a PostgreSQL adapter and a local JSON adapter.
- Use a standard PostgreSQL client with `DATABASE_URL`; create normalized tables and constraints for users, tasks, moods, user progress, focus/break sessions, and daily water logs. Use parameterized queries, foreign keys, unique constraints, and database transactions for task rewards and idempotent Pomodoro completion.
- Select PostgreSQL whenever `DATABASE_URL` is configured. In local development without it, use the JSON adapter and an overridable temporary DB path for tests. In production/Vercel, fail closed with a clear JSON 503 if `DATABASE_URL` is missing; never silently fall back to file storage or `/tmp`.
- Keep the existing production `JWT_SECRET` guard. Document that the owner must set `JWT_SECRET` and `DATABASE_URL` in Vercel for Production and Preview as applicable, then redeploy. Do not commit secrets or a real database URL.
- Add repeatable API tests using an isolated temporary JSON DB for account creation/login, per-user data isolation, task XP/streak updates, mood upserts, water state, and idempotent Pomodoro rewards. Run syntax checks and smoke tests; state clearly that a real hosted-Postgres connection test remains pending until the owner connects a provider.

## Design system
- **Design Movement:** whimsical storybook field journal meets cozy quest log; playful without leaning on a gendered stereotype or distracting from study.
- **Core Principles:** progress over perfection; delightful details with calm hierarchy; rewards celebrate effort, never punish rest; inclusive, legible controls.
- **Color Philosophy:** retain the existing warm paper and ink foundation with rose, marigold, and sage accents; preserve the other five user-selectable palettes.
- **Layout Paradigm:** keep the familiar left navigation / central workbench / optional right-side companion rail, with central tasks and timer as the personal study journal rather than a generic admin dashboard.
- **Signature Elements:** existing paper-like cards and star/sparkle accents; the study-quest vocabulary; XP and streak rings as collectible progress marks.
- **Interaction Philosophy:** every action gets an understandable response, small celebrations remain low-pressure, and the app remains useful without completing optional wellness actions.
- **Animation:** brief springy task/achievement feedback and slow ambient drift only where it does not impair focus; honor `prefers-reduced-motion`.
- **Typography System:** use Fraunces for storybook display headings, DM Sans for readable body copy, and DM Mono for numeric details and timers. Keep the pairing consistent across palettes, with the Cyberpunk theme's intentional monospace display exception.
- **Brand Essence:** a kind little study questbook that turns showing up into visible progress; **warm, curious, encouraging**.
- **Brand Voice:** specific, lightly whimsical, never shaming. Example lines: “Your next tiny quest is waiting.” “A page, a problem, a pause — it all counts as showing up.”
- **Wordmark & Logo:** use a text-only StarJar wordmark in the app chrome and remove the visible image logo from landing, login/signup, and dashboard screens; keep small decorative stars/rings as interface details, not a replacement logo.
- **Signature Brand Color:** warm storybook rose, supported by marigold and sage.

## Project structure
- `public/index.html`, `public/app.html`, `public/auth.html`: landing, authenticated dashboard, and account screens.
- `public/style.css`: shared design tokens, layout, responsive rules, and motion for all pages/themes.
- `public/app.js`, `public/auth.js`, `public/api.js`, `public/rings.js`: frontend behavior, API client, and progress rendering.
- `routes/`: Express API endpoints; all persistent reads/writes use the asynchronous repository interface.
- `db.js`, `lib/db-json.js`, `lib/db-postgres.js`: storage selection, local-only file adapter, and hosted PostgreSQL implementation.
- `lib/gamify.js`: pure XP, level, streak, and achievement rules shared by both adapters.
- `middleware/auth.js`, `lib/express-app.js`: JWT verification, API routing, and safe structured error responses.
- `api/[...path].js`, `dev-server.js`, `vercel.json`: Vercel serverless and local runtime entrypoints.

## Constraints
The owner approved a Postgres refactor but has not yet provisioned or connected a database. No production database URL or Vercel settings are available here. Do not write or expose secrets. Do not claim the production login/signup path is fixed until the owner connects persistent Postgres, configures `JWT_SECRET`, redeploys, and verifies the live API.
