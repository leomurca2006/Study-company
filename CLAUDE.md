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
   - `CFG` (every balancing value: gains, daily caps, friendship rules, streak threshold), `LEVELS` (friendship thresholds, levels 1–10), `PRESETS` (pomodoro rhythms). Tweak numbers there, never inline.
   - `PLANTS`, `EVENTS` (one per day, chosen by `dayNum(date) % EVENTS.length`), `MISSION_POOL` (3 per day, picked deterministically by `missionsOf(date)`).
   - `COSMETICS` (SVG snippets per slot: `tete`/`yeux`/`cou`; entries with `lock` are exclusives, never sold), `SPECIES`, `DECOR`.
   - Collection: every `SPECIES` entry with a `rarity` is collectable (`COLL`, 12). `price` = adoptable for coins, `egg: false` = not in eggs. `story` holds 3 fragments unlocked at friendship levels 2/5/8.
   - `EGGS` (price, minutes of study to hatch, rarity `odds`), `LEVEL_UNLOCKS` (what each friendship level gives: line + story/cosmetic/animation), `ACH` (achievements: `val()` vs `goal`, `reward` = coins/egg/pet/cos), `AMBIANCES`, `THEMES`.
2. **State `S`**:
   - All storage goes through `store.raw` / `store.set`, the only code that touches `localStorage`. To add a backend, replace those two functions.
   - One object persisted as JSON under the key `jardin`, loaded as `{...DEFAULT, ...saved}`. A new top-level key only needs a default in `DEFAULT`. `version` is there for future migrations.
   - On load, unknown ids (companions, cosmetics, decor, eggs, sounds, plants, theme) are filtered out. This protects against imported or old saves. Import (`importSave`) checks the shape before replacing the save and reloading.
   - No save at all (`firstRun`) opens the 3-step tutorial (`#tuto`), where the player picks a companion and their subjects.
   - Nested objects are *not* deep-merged, so when you change the shape of an existing nested key, add migration code (see the old `S.pet` to `S.names` migration).
   - `S.day` holds the per-day counters used by missions and the daily caps (`pa`, `coins`). It resets when the date changes (`dayStats()`).
   - `S.sessions` logs every counted focus session (`date`, `sec`, `sub`, `goal`, `full`, `result`, `feel`). Stats for the week and month are computed from it.
   - Friendship is per species in `S.friend` (PA). `applyDecay()` removes PA after `CFG.graceDays` days away from `S.lastStudy`, never below the current level's threshold. `S.streak` = `{cur, best, last}`.
   - A corrupted save is copied to `localStorage['jardin_corrompu']` before being replaced by defaults.
3. **Pets**:
   - Every species and the partner (Perle, the `pingouine` entry, which can't be adopted) shares one silhouette in `petSVG(species, equip)`. That is why every cosmetic fits every animal.
   - Cosmetic SVGs use fixed coordinates in a 200×220 viewBox: eyes at (84,104)/(116,104), head top at y≈56, neck at y≈130–140.
   - Visual style is "doodle": a dark outline (`LINE`) applied through wrapping `<g stroke>` groups. Ears and back are drawn *before* the body so the body hides their bases.
4. **Ambient audio**: everything is synthesised with WebAudio (noise buffers, filters, LFOs, a scheduled chord loop for lofi). There are no audio files. The context is created lazily; saved volumes are re-applied on the first `pointerdown` because of autoplay rules.
5. **Coins**: every change goes through `addCoins(n, why)`, which feeds the history in `S.tx` (shown in Réglages). `earn()` is the capped variant used for study time.
   **Earning (`credit(sec, full, subId)`)**: the only place where study time turns into rewards: coins (through `earn()`, capped per day), friendship (through `addPA()`, capped per day), subject minutes, plant growth, streak validation. Event multipliers apply. Partial minutes carry over in `S.carry`.
6. **Timer `T`**:
   - It ticks with `Date.now()` deltas, so throttled background tabs stay accurate. `phaseEnd()` handles the pomodoro work/short/long cycle.
   - It is saved separately in `localStorage['jardin_timer']` on every tick. On load, a running countdown resumes and its first tick catches up the time spent closed. A running chrono is restored paused.
   - `endFocus(full)` ends a focus session: under `CFG.minSession` minutes an abandoned session counts nothing. Otherwise it credits, logs to `S.sessions` and opens the `#debrief` dialog.
   - The companion's dialogue comes from `LINES` through `say(kind)` (no consecutive repeat). Its animation state is `data-state` on `.pet.main`, from `petState()`.
7. **Rendering**:
   - Each `render*()` rebuilds its section with `innerHTML`; `renderAll()` runs them all after every state change.
   - Escape user-provided strings with `esc()`.
   - `renderTimer()` runs every tick, so keep it cheap.
   - The room (`roomHTML()`) is rendered into both `#scene` (study tab) and `#decoScene` (Boutique tab). Only the Boutique copy shows `tryDecor` and the accessory `tryOn`.
   - Rooms (`ROOMS`, `S.room`) and window views (`VIEWS`, `S.view`) are bought in the Boutique like themes (`equipOrBuy`, `useBtn`). A room is the `data-chambre` attribute on the scene: CSS styles `.wall` / `.floor`, which `roomHTML()` outputs first so decor and pets stay on top. A view is the markup inside `.window`.
   - The "Mini ville" view is the portfolio's pixel-art city (`VILLE`). It is drawn into one off-screen 160×66 canvas and copied into every `canvas.ville`. Call `VILLE.sync()` after rendering a room: it starts the `requestAnimationFrame` loop, which stops by itself when no city canvas is left. Clicking a building lights its floors one by one.
   - Tab ids are historical: `#penguin` is Collection, `#deco` is Boutique. `#settings` (Réglages) is opened by the ⚙️ button in the header. `#outils` holds to-dos (`S.todos`, linked to the session goal), flashcards (`S.cards`, Leitner boxes 0–4) and notes (`S.notes`).
   - `renderStats()` builds the heatmap, the 7/30-day chart (`statRange`), the weekly goal (`S.weekGoal`), exams (`S.exams`, progress = sessions of that subject since `from`) and the companion's weekly review (`weekReview()`). `renderShop()` renders the category in `shopCat` from the `SHOP` table.
   - `renderAll()` starts with `checkAch()`, which unlocks achievements and friendship cosmetics. Toasts go through a queue, so several can fire in a row.
   - Every purchase except garden seeds goes through `buy(price, name)` (confirmation, debit, coin animation, `S.bought`).
8. **Events**:
   - One delegated `click` listener on `document` dispatches on `data-*` attributes of the clicked `<button>` (`data-tab`, `data-cos`, `data-adopt`, `data-decor`, `data-try`, `data-try-decor`, `data-preview`, `data-dress`, …). Clickable things must be buttons.
   - `change` events on dynamic inputs are delegated too.
   - Try-on and preview state (`preview`, `tryOn`, `tryDecor`, `tryTheme`, `dressing`, `shopCat`, `selSeed`) are runtime UI variables. They are not saved. `preview` also picks the companion shown in the Collection sheet (`selPet()`).

## CSS (style.css)

- Theming uses CSS variables on `:root`; the night mode is `body.night`, which overrides them. Colour themes (`body.theme-*`) only override accent variables, so they combine with night mode.
- `[hidden]` is forced to `display: none !important`, so the `hidden` attribute works on grid/flex components.
- Buttons use the fixed `--btn-ink` so pastel buttons stay readable in both themes.
- The rain overlay opacity comes from `--rain`, which `setVol` sets on `body`.
- Pet positions in the room use `--px`, which changes when `.scene.has-partner` is set.
