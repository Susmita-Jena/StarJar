# StudySync repair and whimsical polish plan

## Goal and scope
Preserve the existing vanilla HTML/CSS/JavaScript frontend and Express API. Repair concrete product and trust issues found in the current implementation, then make the app feel like a playful, welcoming study adventure for a broad range of learners. The repository already contains a Storybook Journal theme and five other theme options; keep and refine the existing design rather than rebuilding it. Prioritize a dependable first-use experience, accurate progress, safe gamification, and friendly polish. Do not attempt an infrastructure migration without the owner's database provider/credentials; the current JSON file store is not a durable multi-instance production database.

## Implementation approach
- Keep existing routes, API payload patterns, and all six themes. Fix the local Express middleware order so the documented startup flow can serve HTML/CSS/JS as well as API responses. Preserve the existing warm Storybook visual language and component structure; correct CSS syntax issues and tune targeted copy/interactions rather than replacing the design system.
- Tighten server-side auth-secret and Pomodoro validation; avoid rewarding invalid timer requests. Correct discrepancies between actual rewards and landing-page promises; do not pressure users to log mood or water for points.
- Make the focus timer resilient to page refresh using local session state and an idempotent completion identifier, and show completion counts based on the actual completion date.
- Improve microcopy and small game-like details with a cozy field-journal/RPG voice, while retaining clear contrast, reduced-motion support, keyboard access, mobile layout, and non-gendered framing.
- Run the repository's available checks and local HTTP/API smoke checks. Keep secrets and personal data out of the repository; do not alter `.env` or tracked data.

## Design system
- **Design Movement:** whimsical storybook field journal meets cozy quest log; playful without leaning on a gendered stereotype or distracting from study.
- **Core Principles:** progress over perfection; delightful details with calm hierarchy; rewards celebrate effort, never punish rest; inclusive, legible controls.
- **Color Philosophy:** retain the existing warm paper and ink foundation with rose, marigold, and sage accents; preserve the other five user-selectable palettes.
- **Layout Paradigm:** keep the familiar left navigation / central workbench / optional right-side companion rail, with central tasks and timer as the personal study journal rather than a generic admin dashboard.
- **Signature Elements:** existing paper-like cards and star/sparkle accents; the study-quest vocabulary; XP and streak rings as collectible progress marks.
- **Interaction Philosophy:** every action gets an understandable response, small celebrations remain low-pressure, and the app remains useful without completing optional wellness actions.
- **Animation:** brief springy task/achievement feedback and slow ambient drift only where it does not impair focus; honor `prefers-reduced-motion`.
- **Typography System:** retain the existing Nunito Sans body, DM Serif Display chapter headings, and JetBrains Mono for numbers/timers.
- **Brand Essence:** a kind little study questbook that turns showing up into visible progress; **warm, curious, encouraging**.
- **Brand Voice:** specific, lightly whimsical, never shaming. Example lines: “Your next tiny quest is waiting.” “A page, a problem, a pause — it all counts as showing up.”
- **Wordmark & Logo:** preserve the supplied StudySync mark; use existing star/book motifs in UI details instead of replacing the brand asset.
- **Signature Brand Color:** warm storybook rose, supported by marigold and sage.

## Project structure
- `public/index.html`, `public/app.html`, `public/auth.html`: landing, authenticated dashboard, and account screens.
- `public/style.css`: shared design tokens, layout, responsive rules, and motion for all pages/themes.
- `public/app.js`, `public/auth.js`, `public/api.js`, `public/rings.js`: frontend behavior, API client, and progress rendering.
- `routes/`, `middleware/`, `lib/`, `db.js`: Express API, auth, gamification rules, and current JSON data adapter.
- `api/[...path].js`, `dev-server.js`, `vercel.json`: serverless and local runtime entrypoints.

## Constraints
No database service or durable storage credentials are configured in the repository. The JSON-file adapter is appropriate for local/small-scale use only and cannot guarantee durable data for Vercel serverless multi-user production. Surface this clearly rather than fabricating a migration or claiming multi-user production reliability. Never change or publish secrets.
