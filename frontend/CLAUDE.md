# Thermora frontend — rules for every agent working here

Two Claude agents build this frontend in parallel, each directed by a human teammate.
They cannot talk to each other directly. **This file and `TASKS.md` are how they coordinate.**

- **Agent A** — globe & 3D (directed by the teammate who set up this repo)
- **Agent B** — app UI, panels, charts (directed by the second frontend teammate)

**Agent B: read `frontend/HANDOFF.md` first (latest, Sat 14 Nov evening): full state, backend contract, open backend requests and why, what's left.** `frontend/AGENT_B_BRIEFING.md` is the older original briefing (hackathon, science, product).

## Before you start any work
1. `git fetch origin` and read the latest `frontend/TASKS.md` on `submain` **and** on the other agent's open branches.
2. Pick only tasks assigned to you. Mark them `🟡 in progress` in `TASKS.md` in your first commit.

## Ownership — never edit the other agent's files
| Path | Owner |
|---|---|
| `src/globe/**` | Agent A |
| `src/ui/**`, `src/charts/**` | Agent B |
| `src/shared/**` (types, store, api, geo, regions) | Shared contract — see below |
| `src/App.tsx` (layout slots), `src/index.css` (design tokens) | Agent B may restyle/re-layout; keep the `<GlobeView/>` full-screen slot |
| `public/textures/**` | Agent A |
| `CLAUDE.md`, `TASKS.md` | Both (append, don't rewrite the other agent's lines) |

If you need something in the other agent's area, **don't change it — add a request line to the "Requests" section of `TASKS.md`.**

## Shared contract (`src/shared/`)
- Components get data **only** through `src/shared/api.ts` (`getRegions`, `getCells`, `getSummary`). Never `fetch()` in components.
- Global state lives **only** in `src/shared/store.ts` (`useApp`): `regionId`, `mode`, `year`, `playing`, `touring`.
- You may **add** fields/actions/types. **Renaming or removing** anything requires a line in `TASKS.md → Contract changes` and must not break the other agent's build.
- **Real data only.** There is no sample, mock or placeholder data anywhere. Every number comes from the backend (`VITE_API_URL`, else the team's deployed URL). If a call fails, show "unavailable" and nothing in its place. A missing human score is shown as "no score" (grey on the globe), never as an invented value. Never add written claims about a country that don't come from the data.

## Git
- **Current workflow (since Sat 14 Nov):** the latest frontend lives on **`frontend/final-backend`**, built on `main`. Work goes onto `main` **only when the humans say "push"**, as a fast-forward (`git push origin <branch>:main`, after `git merge-base --is-ancestor origin/main HEAD`; if main moved, merge `origin/main` in and re-test first). Never force-push. Never push to `main` without the humans' go.
- `submain` was the integration branch earlier in the hackathon; it is no longer where new work lands.
- Branches: Agent A → `frontend/globe-<topic>`, Agent B → `frontend/ui-<topic>`. Never commit straight to `submain` either.
- Keep PRs small. Rebase on `submain` before opening a PR.
- Commit messages: `[A] …` or `[B] …` prefix.
- Never touch anything outside `frontend/` (backend/data folders belong to other teammates).

## Tech
Vite + React 19 + TypeScript, Tailwind v4 (tokens in `src/index.css` `@theme`), react-globe.gl / three.js, zustand, recharts, framer-motion. Font: `@fontsource-variable/archivo` (wdth axis).
`npm run dev` · `npm run build` (must pass before every push — it type-checks).

## Design language — "instrument plate over a live Earth"
**Read `frontend/DESIGN.md` before any visual work. It's binding.** In short:
- Dark only. The globe is the hero; UI sits on smoked-glass `.panel` plates with hairlines and no corner brackets.
- One typeface: **Archivo** (variable width + weight). Expanded for the wordmark and big readouts, normal for text, condensed `.label` for captions. **No monospace, no all-caps, no `·`-joined meta strings, no em-dash labels, no `→` on buttons.**
- Colors via tokens only: `fire` = legacy record, `cyan` (pale VIIRS ice) = harmonized/corrected, `missed` (magenta) = fires the legacy record missed, `ok`/`warn` for verdicts.
- Motion only in response to user actions (and the globe intro). Numbers count up when the mode toggles; **the toggle must visibly change numbers**.
- Must work on a phone (panels become a bottom sheet) and on a weak laptop.
