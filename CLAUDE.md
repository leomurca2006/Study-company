# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Jardin d'Étude": a gamified study timer (pomodoro / free countdown / stopwatch) with a garden, missions, daily events, a companion pet with cosmetics, room decoration and a generated lofi ambience. Static site, vanilla HTML/CSS/JS, no build, no dependencies (only Google Fonts). All UI text is in French; keep it that way.

## Running / checking

- Run: open `index.html` directly in a browser (works from `file://`).
- Syntax check: `node --check app.js`
- There is no test suite. `app.js` ends with a few `console.assert` self-checks on pure helpers (`missionsOf`, `fmt`).
- Visual check (Windows, headless Edge):
  `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --window-size=1200,1000 --virtual-time-budget=3000 --screenshot=<out.png> "file:///C:/Users/leomu/Desktop/Site-Pomodoro/index.html"`
  - Console errors: replace `--screenshot=…` with `--enable-logging=stderr --v=0 --dump-dom` and grep for `CONSOLE`.
  - To test with specific save data or a specific tab: write a scratch HTML page that sets `localStorage.jardin`, then loads `index.html` in an iframe. In `onload`, click elements through `f.contentDocument`. Run Edge with `--allow-file-access-from-files`.

## Architecture (app.js)

Single script, organised top to bottom:

1. **Static game data**:
   - `PLANTS`, `EVENTS` (one per day, chosen by `dayNum(date) % EVENTS.length`), `MISSION_POOL` (3 per day, picked deterministically by `missionsOf(date)`).
   - `COSMETICS` (SVG snippets per slot: `tete`/`yeux`/`cou`), `SPECIES`, `DECOR`.
2. **State `S`**:
   - One object persisted as JSON in `localStorage['jardin']`, loaded as `{...DEFAULT, ...saved}`. A new top-level key only needs a default in `DEFAULT`.
   - Nested objects are *not* deep-merged, so when you change the shape of an existing nested key, add migration code (see the old `S.pet` to `S.names` migration).
   - `S.day` holds the per-day counters used by missions and resets when the date changes (`dayStats()`).
3. **Pets**:
   - Every species and the partner (Perle, the `pingouine` entry, which can't be adopted) shares one silhouette in `petSVG(species, equip)`. That is why every cosmetic fits every animal.
   - Cosmetic SVGs use fixed coordinates in a 200×220 viewBox: eyes at (84,104)/(116,104), head top at y≈56, neck at y≈130–140.
   - Visual style is "doodle": a dark outline (`LINE`) applied through wrapping `<g stroke>` groups. Ears and back are drawn *before* the body so the body hides their bases.
4. **Ambient audio**: everything is synthesised with WebAudio (noise buffers, filters, LFOs, a scheduled chord loop for lofi). There are no audio files. The context is created lazily; saved volumes are re-applied on the first `pointerdown` because of autoplay rules.
5. **Earning (`credit(sec)`)**: the only place where study time turns into rewards: coins, subject minutes, plant growth, mood. It is affected by event multipliers and by the mood bonus (≥80 → +10 %). Partial minutes carry over in `S.carry`.
6. **Timer `T`**: runtime only, never saved. It ticks with `Date.now()` deltas, so throttled background tabs stay accurate. `phaseEnd()` handles the pomodoro work/short/long cycle.
7. **Rendering**:
   - Each `render*()` rebuilds its section with `innerHTML`; `renderAll()` runs them all after every state change.
   - Escape user-provided strings with `esc()`.
   - `renderTimer()` runs every tick, so keep it cheap.
   - The room (`roomHTML()`) is rendered into both `#scene` (study tab) and `#decoScene` (Déco tab). Only the Déco copy shows `tryDecor`.
8. **Events**:
   - One delegated `click` listener on `document` dispatches on `data-*` attributes of the clicked `<button>` (`data-tab`, `data-cos`, `data-adopt`, `data-decor`, `data-try`, `data-try-decor`, `data-preview`, `data-dress`, …). Clickable things must be buttons.
   - `change` events on dynamic inputs are delegated too.
   - Try-on and preview state (`preview`, `tryOn`, `tryDecor`, `dressing`, `selSeed`) are runtime UI variables. They are not saved.

## CSS (style.css)

- Theming uses CSS variables on `:root`; the night mode is `body.night`, which overrides them.
- Buttons use the fixed `--btn-ink` so pastel buttons stay readable in both themes.
- The rain overlay opacity comes from `--rain`, which `setVol` sets on `body`.
- Pet positions in the room use `--px`, which changes when `.scene.has-partner` is set.
