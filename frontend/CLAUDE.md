# Thermora frontend — rules for every agent working here

Two Claude agents build this frontend in parallel, each directed by a human teammate.
They cannot talk to each other directly. **This file and `TASKS.md` are how they coordinate.**

- **Agent A** — globe & 3D (directed by the teammate who set up this repo)
- **Agent B** — app UI, panels, charts (directed by the second frontend teammate)

**Agent B: if you are new to this project, read `frontend/AGENT_B_BRIEFING.md` first.** It has the full context (hackathon, science, product, your role).

## Before you start any work
1. `git fetch origin` and read the latest `frontend/TASKS.md` on `submain` **and** on the other agent's open branches.
2. Pick only tasks assigned to you. Mark them `🟡 in progress` in `TASKS.md` in your first commit.

## Ownership — never edit the other agent's files
| Path | Owner |
|---|---|
| `src/globe/**` | Agent A |
| `src/ui/**`, `src/charts/**` | Agent B |
| `src/shared/**` (types, store, api, mock, regions) | Shared contract — see below |
| `src/App.tsx` (layout slots), `src/index.css` (design tokens) | Agent B may restyle/re-layout; keep the `<GlobeView/>` full-screen slot |
| `public/textures/**` | Agent A |
| `CLAUDE.md`, `TASKS.md` | Both (append, don't rewrite the other agent's lines) |

If you need something in the other agent's area, **don't change it — add a request line to the "Requests" section of `TASKS.md`.**

## Shared contract (`src/shared/`)
- Components get data **only** through `src/shared/api.ts` (`getRegions`, `getCells`, `getSummary`). Never `fetch()` in components.
- Global state lives **only** in `src/shared/store.ts` (`useApp`): `regionId`, `mode`, `year`, `playing`, `touring`.
- You may **add** fields/actions/types. **Renaming or removing** anything requires a line in `TASKS.md → Contract changes` and must not break the other agent's build.
- Mock data is served until `VITE_API_URL` is set. The UI must keep showing the "MOCK DATA" badge while `USING_MOCK` is true — never present mock numbers as real results.

## Git
- **`main` is off-limits.** Never commit, push, merge, rebase onto, or open a PR into `main` — and never suggest doing so. It is only touched when the humans explicitly say so.
- **`submain` is the integration branch** for all frontend work. Branch from `submain`, open PRs into `submain`; the humans merge them.
- Branches: Agent A → `frontend/globe-<topic>`, Agent B → `frontend/ui-<topic>`. Never commit straight to `submain` either.
- Keep PRs small. Rebase on `submain` before opening a PR.
- Commit messages: `[A] …` or `[B] …` prefix.
- Never touch anything outside `frontend/` (backend/data folders belong to other teammates).

## Tech
Vite + React 19 + TypeScript, Tailwind v4 (tokens in `src/index.css` `@theme`), react-globe.gl / three.js, zustand, recharts, framer-motion.
`npm run dev` · `npm run build` (must pass before every push — it type-checks).

## Design language — "mission control, real-time Earth"
- Dark only. Globe is the hero; UI floats over it in `.panel` glass cards with cyan corner brackets.
- Colors (use the Tailwind tokens, no raw hex in components): `fire` = legacy record, `cyan` = harmonized/corrected, `missed` (magenta) = fires the legacy record missed, `ok`/`warn` for verdicts.
- Type: Space Grotesk for text, JetBrains Mono for numbers & `.label` telemetry captions (uppercase, letter-spaced).
- Motion: smooth and purposeful (fly-to ~1.6s, panels slide 250–350ms). Numbers count up when the mode toggles — **the toggle must visibly change numbers**.
- Must work on a phone (panels become a bottom sheet) and on a weak laptop.
