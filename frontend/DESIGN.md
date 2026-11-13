# Thermora design system — "a reading column beside a live planet"

> **Update 15:50 (editorial refactor, A12).** The twist leads: the app opens in **Human or natural**, under the question **"Who lit it?"**. The signature control is the **Spectrum** (`src/ui/Spectrum.tsx`): a histogram of the year's fires by area human-likelihood with two handles that filter the globe live (keys N / M / U / A, H toggles the colouring). Layout is one opaque **editorial column** (left) + the **full-bleed globe**, with controls set on the globe as type. No floating glass boxes. Display type is **Gloock** (high-contrast serif) for `h1`/`h2`: the question, region and place names. UI and numbers stay in Archivo. Inside `.column` and `.bare`, `.panel` dissolves into the page (no background, no border). Hierarchy comes from type and hairline rules (`.rule`). Mode names: "Human or natural", "Corrected record", "MODIS only".


Applies to both agents. Tokens live in `src/index.css`; this file explains them and lists the rules.

## Why this direction

The subject is satellite fire detection: NASA instruments (MODIS, VIIRS) reading heat off a live planet. The old look (Space Grotesk + JetBrains Mono, all-caps tracked labels, cyan corner brackets, dot-separated meta strings) was the generic sci-fi HUD that any generated dashboard gets. The new direction borrows from **real instrument and NASA/JPL vernacular** instead:

- **Type: Archivo** (Omnibus-Type, OFL). JPL's own design system *Explorer 1* is built on Archivo Narrow. The variable version has a **width axis (62–125%)**, so one family covers the whole hierarchy by changing width instead of mixing typefaces.
- **Panels are instrument plates:** smoked glass, a hairline rule, small radius, no decoration.
- **Text is dial-paint bone (`#ece6d8`), not blue-white.** The one bold element is the **expanded numeric readouts** (plus the ember globe). Everything else stays quiet.

## Tokens (Tailwind names unchanged, so existing classes keep working)

| Token | Value | Use |
|---|---|---|
| `ink` | `#000000` | space / page |
| `panel` | `rgb(9 11 15 / .74)` | plates |
| `line` | `rgb(236 230 216 / .12)` | hairlines |
| `text` | `#ece6d8` | primary text |
| `dim` | `#9a9488` | secondary text |
| `fire` | `#ff5a1f` | legacy MODIS |
| `fire-hot` | `#ffb35c` | hottest |
| `cyan` | `#8fd3e8` | harmonized / corrected (pale VIIRS ice; name kept for compatibility) |
| `missed` | `#ff3d81` | fires the legacy record missed |
| `ok` / `warn` | `#7bd88f` / `#f2c14e` | verdicts |

## Type scale (one family, three widths)

| Role | Width | Weight | Size | How |
|---|---|---|---|---|
| Wordmark | 125% | 800 | 20px | `.wordmark` |
| Readout (big numbers) | 125% | 720 | 30–48px | `.readout`, or automatic for `font-mono text-3xl/4xl/5xl` |
| Heading / question | 100% | 650 | 15–18px | `h1–h3` or `font-semibold` |
| Body | 100% | 400 | 15px | default |
| Small number | 112%, tabular | inherit | 12–14px | `font-mono` (now tabular Archivo, not monospace) |
| Caption / label | 72% condensed | 500 | 12.5px | `.label` (sentence case) |

## Rules

1. **No all-caps anywhere.** Remove `uppercase` and `tracking-wider/widest/[0.2em]…` classes. Labels are sentence case and use `.label`.
2. **No dot-joined meta strings** (`Region spotlight · 2019`). Put the second fact in its own element, aligned right or set in `text-dim`. Example: title "Amazon Basin" on the left, `2019` as a quiet readout on the right.
3. **No em-dash labels** (`MOCK DATA — NOT REAL RESULTS`) and **no `→` on buttons or links.** The badge says "Sample data, not results". Buttons say exactly what they do: "Start tour", "Stop tour", "Methods".
4. **Wordmark:** `<span className="wordmark">Thermora</span>`, not tracked caps.
5. **Toggle labels:** "Legacy (MODIS)", "Harmonized", "Missed fires", in sentence case. The active state is carried by color (`fire` / `cyan` / `missed`) and a filled plate, not by caps.
6. **Hierarchy through width and weight, not decoration.** No corner brackets, glows or gradients on panels. The spotlight is the primary plate; the region list can be lighter (less background, more transparency).
7. **Big numbers are the signature.** Use `.readout` for the undercount %, the fire counts and the year. Don't add more accent colors.
8. **Charts:** axis text uses `.label` sizing (condensed). Gridlines use `line`. Series: `fire` = legacy/raw, `cyan` = harmonized/corrected, `missed` = gap.
9. **Motion:** only in response to user actions (toggle, select, play) plus the globe's intro fly-in. `prefers-reduced-motion` is respected globally.
10. **Focus:** keep the global `:focus-visible` ring; don't remove outlines.
