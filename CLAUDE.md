# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Jardin d'Étude": a gamified study timer (pomodoro / free countdown / stopwatch) with missions, monthly events, eggs to hatch, flashcards, a companion pet with cosmetics, room decoration and a generated lofi ambience. Static site, vanilla HTML/CSS/JS, no build, no dependencies (only Google Fonts). All UI text is in French; keep it that way.

## Game rules (the player's spec, all implemented; keep them true)

Numbers live in `CFG`, `LEVELS`, `STREAK_REWARDS` and `EGGS`; change them there.

- **Timers**: chrono (with pause), free countdown (`libre`), pomodoro at 25/5, 50/10 or 90/20 (or custom) with a chosen number of pomodoros (`S.cfg.rounds`). After the last one the series stops (no break).
- **Coins**: 1 per minute of work, +10 for a session finished without abandoning (`coinsFull`). Abandoning keeps everything already earned and costs nothing.
- **Pause during work**: free up to 10 min in total per focus session (`pauseFree`). Past that, -1 coin per minute (`pausePenalty`), taken as it happens (`chargePause()`, run on resume, on abandon and every 30 s).
- **Friendship**: 1 PA per minute (`paPerMin`), and a level is 100 PA, so 10 min = 10 % of a level. Every 15 h without studying (`decayHours`), the active companion loses 25 % of its PA (`decayRate`), repeated until the player studies again. Levels can go down.
- **Companion lines**: welcome on load (`hello`, or `back` after 2+ days away), encouragement during work (`start`, `mid`), rest during breaks (`pause`), and congratulations at the end (`end`).
- **Eggs**: one egg per rarity (Boutique › Œufs). Each hatches a companion of its rarity after 3 h (commun), 6 h (peu commun), 10 h (rare), 15 h (épique), 20 h (légendaire) or 24 h (mythique) of study. Study minutes count for every egg at once. Egg accelerators (60 coins = 1 h, `boostPrice`/`boostMin`) are kept in `S.boosts` and used from the Couveuse.
- **Collection**: 25 companions. In eggs: 5 commun, 5 peu commun, 4 rare, 4 épique, 3 légendaire, 3 mythique. The hibou (`egg: false`) is the exclusive companion of a 30-day streak. A `console.assert` checks these counts.
- **Streak**: the player validates each day by clicking the "Je suis là" badge on the room (`checkIn()`). Freezes (150 coins) cover missed days. `STREAK_REWARDS`: 7 days = 50 coins, 14 days = 1 egg accelerator, 30 days = hibou (150 coins if already owned), 90 days = 500 coins.
- **Shop**: companion cosmetics, room decor, seasonal decor, rooms, window views, colour themes, ambience sounds, egg accelerators and streak freezes.
- **Events**: one per month, active from the 1st to the 7th (`eventDays`, `eventOf()` / `monthEvent()`). The rest of the month is `CALM`, and the banner announces the next event.

## Design direction (applies to everything new)

The reference is the latest Boutique items: the rooms (`ROOMS`), the window views (`VIEWS`) and the "Mini ville". Every new or restyled element (shop items, decor, cosmetics, screens, effects) follows their look:

- **Palette** (from the portfolio's pixel city, `VILLE`):
  - night sky violets: `#110927` `#241050` `#4B1A72` `#7A2380`;
  - buildings: `#2D1A62` `#35206F` `#201246` `#150B31`;
  - neon: magenta `#FF4FD8`, cyan `#4FE3FF`;
  - amber lit windows: `#FFC46B` `#FFD99A`;
  - light tints for daytime: `#FBE9FF` `#E7CFF5` `#D9BDEE` `#F4B5E8` `#FF8FE6` `#D9F7FF` `#BFF6FF` `#8FF0FF`.
- **Day and night**: day uses the light tints. Night uses the violets with neon accents (glow through `box-shadow` / `drop-shadow`, e.g. the grenier baseboard, the lightning bolt's cyan halo). Never darken with a brightness filter; use the violet multiply overlay or explicit night colours.
- **Pixel art**: the city is drawn as pixel art on a canvas with `image-rendering: pixelated`. Room decor and seasonal cosmetics are pixel art too (see Pixel art below). Emojis stay only as UI icons (buttons, tabs, toasts).
- **Where it lives**: the whole site uses this palette. The CSS variables in `:root` / `body.night` hold it, so prefer `var(--…)` over new hex values. Hard-coded colours in the JS data use it too: `RARITY`, `EGGS`, `THEMES` swatches, rugs in `DECOR`, `PALETTE` (subject colours), decor flowers.
- **Night**: a magenta glow rises from the bottom of the page, and active tabs/modes get a neon halo.
- **Pets**: pixel art in the "doux" style the player chose: no dark outline, the edge is a darker shade of its own colour, a violet shadow bottom-right, a light reflection top-left, 2×2 eyes with a glint (see Pets below). `LINE` (ink of the faces) is the building violet `#2D1A62`, the same value as `--btn-ink`.
- **Themes** (`body.theme-*`) are variants of the palette: amber (pêche), mint-neon (menthe), cyan (ciel). They are not new pastels.
- **Old subject colours**: saves with the old pastel subject colours are mapped to the new `PALETTE` on load (`OLD_PAL`).

## Running / checking

- Run: open `index.html` directly in a browser (works from `file://`).
- Syntax check: `node --check app.js`
- There is no test suite. `app.js` ends with `console.assert` self-checks on pure helpers and data integrity (`missionsOf`, `fmt`, `fmtMin`, `levelOf`, `eventOf`, `decayAfter`, collection size and companions per rarity, unique achievement ids, egg odds summing to 1, streak rewards). They only show up in the browser console (see the console-errors command below). Add one when you add a pure helper or change data that has an invariant.
- Visual check (Windows, headless Edge):
  `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --window-size=1200,1000 --virtual-time-budget=3000 --screenshot=<out.png> "file:///C:/Users/leomu/Desktop/Site-Pomodoro/index.html"`
  - Console errors: replace `--screenshot=…` with `--enable-logging=stderr --v=0 --dump-dom` and grep for `CONSOLE`.
  - To test with specific save data or a specific tab: write a scratch HTML page that sets `localStorage.jardin`, then loads `index.html` in an iframe. In `onload`, click elements through `f.contentDocument`. Run Edge with `--allow-file-access-from-files`.

## Architecture (app.js)

Single script, organised top to bottom:

1. **Static game data**:
   - `CFG` (every balancing value: gains, daily coin cap, friendship gain and decay, pause penalty, egg accelerator, event length, freezes), `LEVELS` (friendship thresholds, levels 1–10, 100 PA apart), `STREAK_REWARDS` (streak milestones), `PRESETS` (pomodoro rhythms). Tweak numbers there, never inline.
   - `EVENTS` (one per month, effects `coinMult` / `eggMult` / `paMult` / `missionMult`: `monthEvent(date)`; `eventOf(date)` returns it during the first `CFG.eventDays` days, else `CALM`), `MISSION_POOL` (3 per day, picked deterministically by `missionsOf(date)`).
   - `COSMETICS` (SVG snippets per slot: `tete`/`yeux`/`cou`; entries with `lock` are exclusives, never sold), `SPECIES`, `DECOR`.
   - Collection: every `SPECIES` entry with a `rarity` is collectable (`COLL`, 25, sorted by `RARITY` order). `price` = adoptable for coins, `egg: false` = not in eggs. `story` holds 3 fragments unlocked at friendship levels 2/5/8.
   - `RARITY` (6 tiers: commun, peuCommun, rare, epique, legendaire, mythique), `EGGS` (one per rarity, same key: price, minutes of study to hatch, `odds` = 100 % its own rarity), `LEVEL_UNLOCKS` (what each friendship level gives: line + story/cosmetic/animation), `ACH` (achievements: `val()` vs `goal`, `reward` = coins/egg/pet/cos), `AMBIANCES`, `THEMES`.
2. **State `S`**:
   - All storage goes through `store.raw` / `store.set`, the only code that touches `localStorage`.
   - **Online account (Supabase, email + password)**: `CLOUD = { url, key }` near the top of `app.js` holds the project URL and the public (anon/publishable) key. Leave them empty to turn the account off. The table and its row-level security are in `supabase.sql`. The live project is `vyxgjihjbukpwoytomux` (organization "Study Company", region eu-west-3). Email confirmation is off (`mailer_autoconfirm`), so a new account can play right away. Only `select`/`insert`/`update` are granted to `authenticated`, nothing to `anon`. Calls go through `sb(path, opts)`, plain `fetch` to the Auth (`/auth/v1/…`) and REST (`/rest/v1/saves`) endpoints, with no SDK. The session (`auth`) is kept in `localStorage['jardin_auth']`, and `freshAuth()` renews it before it expires.
   - Sync: `localStorage` stays the working copy (offline works). `save()` stamps `S.savedAt` and schedules `pushCloud()` 4 s later (upsert of the whole `S`). `pullCloud(atLogin, base)` loads the online copy when it is newer than `base`. At startup `base` is `loadedAt`, the copy's date before any startup save; at login the player is asked instead. Loading writes `localStorage` and reloads the page. No push happens before that first comparison (`cloudReady`). Last write wins, with no merge. `importSave` stamps `savedAt` so the imported file wins.
   - One object persisted as JSON under the key `jardin`, loaded as `{...DEFAULT, ...saved}`. A new top-level key only needs a default in `DEFAULT`. `version` is there for future migrations.
   - On load, unknown ids (companions, cosmetics, decor, eggs, sounds, achievements, theme) are filtered out, and the keys of the removed garden (`plots`, `inv`, `harvested`) are deleted. This protects against imported or old saves. Import (`importSave`) checks the shape before replacing the save and reloading.
   - No save at all (`firstRun`) opens the 3-step tutorial (`#tuto`), where the player picks a companion and their subjects.
   - Nested objects are *not* deep-merged, so when you change the shape of an existing nested key, add migration code (see the old `S.pet` to `S.names` migration).
   - `S.day` holds the per-day counters used by missions and the daily coin cap (`coins`). It resets when the date changes (`dayStats()`).
   - `S.sessions` logs every counted focus session (`date`, `sec`, `sub`, `goal`, `full`, `result`, `feel`). Stats for the week and month are computed from it.
   - Friendship is per species in `S.friend` (PA). `applyDecay()` (on load and every 30 s) removes 25 % of the active companion's PA per full 15 h since `S.lastStudyAt` (ms); `S.decayed` counts the 15 h slices already applied and is reset by `credit()`. `S.lastStudy` (date) still drives the "back" greeting and the sad pet.
   - `S.streak` = `{cur, best, last}`, advanced only by `checkIn()` (the `#streakBadge` button). `S.boosts` = egg accelerators in stock.
   - A corrupted save is copied to `localStorage['jardin_corrompu']` before being replaced by defaults.
3. **Pets**:
   - Every species and the partner (Perle, the `pingouine` entry, which can't be adopted) shares one silhouette. That is why every cosmetic fits every animal.
   - Species and cosmetics are still *written* as vector SVG in a 200×220 viewBox: eyes at (84,104)/(116,104), head top at y≈56, neck at y≈130–140. Ears and back are drawn *before* the body so the body hides their bases. Do not draw eyes or cheeks in a species: they are stamped as pixels.
   - **Pixelisation** (`petVec` → `pixPet`): each companion is drawn in 3 layers (`base`, `cos`, `book`) with the outline stroked in the marker colour `MAGIC`. Each layer is rendered as an image onto a canvas and reduced to 32×35 pixels (`PET_N`/`PET_M`, plus 1 pixel of margin) by colour vote per cell (`petCells`): the outline (`MAGIC`) and the face ink (`LINE`) win over a smaller share of the cell. `softPx()` turns outline pixels into a darker shade of the neighbouring colour and adds the shadow and reflection. Eyes (light on a dark patch: panda, raton) and cheeks are stamped last. The result is an SVG of `<rect>`s; the book is in `g.book` (shown only while studying).
   - `petSVG(species, equip)` is asynchronous under the hood: the first call returns an empty `svg[data-pk]` of the same size and queues `pixPet()`; when done, the result is cached in `pxPets` and replaces every waiting `svg[data-pk]`. If the browser refuses to read the canvas back, the vector drawing is used instead.
4. **Ambient audio**: `SOUNDS` mixes two kinds of sources.
   - **MP3 files** (`files`, in `sons/`, from Pixabay): lofi (4 tracks chained in random order by `track()`), pluie, vent, voitures. They play through a plain `<audio>` element whose `volume` is set directly. Do not route them through WebAudio: from `file://`, `createMediaElementSource` outputs silence (cross-origin rule). A file is only loaded the first time its volume goes above 0.
   - **Synthesised** sounds (`build`, WebAudio noise, filters and LFOs): café and forêt. The context is created lazily.
   - Saved volumes are re-applied on the first `pointerdown` because of autoplay rules.
5. **Coins**: every change goes through `addCoins(n, why)`, which feeds the history in `S.tx` (shown in Réglages). `earn()` is the capped variant used for study time.
   **Earning (`credit(sec, full, subId)`)**: the only place where study time turns into rewards: coins (through `earn()`, capped per day), friendship (through `addPA()`, 1 PA per minute), subject minutes, egg incubation. Event multipliers apply. Partial minutes carry over in `S.carry`. The streak is not validated here (see `checkIn()`).
6. **Timer `T`**:
   - It ticks with `Date.now()` deltas, so throttled background tabs stay accurate. `phaseEnd()` handles the pomodoro work/short/long cycle.
   - It is saved separately in `localStorage['jardin_timer']` on every tick. On load, a running countdown resumes and its first tick catches up the time spent closed. A running chrono is restored paused.
   - `endFocus(full)` ends a focus session. It always credits the time (abandoning keeps what was earned). Under `CFG.minSession` minutes an abandoned session stops there; otherwise it logs to `S.sessions` and opens the `#debrief` dialog.
   - Pomodoro: `T.count` counts finished pomodoros of the series; `phaseEnd()` stops the series at `S.cfg.rounds`, and abandoning resets it. Pauses during work are tracked in `T.pauseSec` / `T.pausedAt`, and `T.charged` holds the coins already taken by `chargePause()`. `setPhase()` resets all three.
   - The companion's dialogue comes from `LINES` through `say(kind)` (no consecutive repeat). Its animation state is `data-state` on `.pet.main`, from `petState()`.
7. **Rendering**:
   - Each `render*()` rebuilds its section with `innerHTML`; `renderAll()` runs them all after every state change.
   - Escape user-provided strings with `esc()`.
   - `renderTimer()` runs every tick, so keep it cheap.
   - **Room geometry.** `#decoScene` (shop preview) is 400px high. On the study tab, `fitScene()` (run by a `ResizeObserver`) sizes `#scene`: the room is about 900px wide in design units, `--H` high (75 % of the screen), and drawn at scale `--z`. `.room` gets `width: 100% / --z`, `height: --H` and `transform: scale(--z)`. So vertical positions must be in % of the room (window at `top: 24%`, `height: 35%`; sill line at `59% - 6px`; wall items in %), or in px from the bottom for floor items. Horizontal positions are in %. `--winL` is the wall width beside the window (the window is `min(56%, 480px)` wide). Sprites are sized in `em` and `.room` sets the font size: 16px in the shop, 2.2× in `#scene` (1.2× under 700px). Overlays outside `.room` (timer, badge, `.bubble`) multiply their px offsets by `--z`.
   - **Decor zones** (avoid overlaps when adding items): seasonal floor items go in the outer corners (left 0–23 %, right 0–18 %). Base floor items sit further in: nounours at left 24 %, plante at right 18.5 %, bocal at right 28 %. The pet occupies the middle, about 38–62 %. On the wall: left column has poster, lanterne, horloge, étagère; right column has suspendue, cadre, then cloche/bouée (46 %); between them and the window are the socks. Garlands run along the top, small items on the sill.
   - The room (`roomHTML()`) is rendered into both `#scene` (study tab) and `#decoScene` (Boutique tab). Only the Boutique copy shows `tryDecor` and the accessory `tryOn`.
   - Rooms (`ROOMS`, `S.room`) and window views (`VIEWS`, `S.view`) are bought in the Boutique like themes (`equipOrBuy`, `useBtn`). A room is the `data-chambre` attribute on the scene: CSS styles `.wall` / `.floor`, which `roomHTML()` outputs first so decor and pets stay on top. A view is the markup inside `.window`.
   - Seasons (`SEASONS`, `S.season`, `''` = the bought room without a season) are switched for free with the ‹ › buttons (`data-season-step`) or a horizontal swipe on any `.scene` (`stepSeason()`). A season sets `data-saison` on the scene. Its pixel wall/floor (`.scene[data-saison=…]` in `FLAT_PX`, more specific than rooms, so it wins even at night) replaces the room's. Trying a room in the Boutique shows it without the season, otherwise the season would hide it. Its `base` (falling leaves/petals) is output after the window.
   - Seasonal cosmetics are `DECOR` entries with `season`, bought in the Boutique's "Saisons" category (`decorItem` is shared with "Décor"). `roomHTML()` only shows them during their season. Trying one in the shop switches the preview to its season. Helpers: `sp()` (one positioned sprite; `.sd` has `pointer-events: none` so pets stay clickable), `bunting()` (garland across the top: sprites or `lights`), `falling()`. Windowsill items use `sillL(i)` / `sillR(i)`, anchored to the window edge and the sill line (230px). Corners and top band are used to avoid the bought non-seasonal `DECOR` spots.
   - The "Mini ville" view is the portfolio's pixel-art city (`VILLE`). It is drawn into one off-screen 160×66 canvas and copied into every `canvas.ville`. Call `VILLE.sync()` after rendering a room: it starts the `requestAnimationFrame` loop, which stops by itself when no city canvas is left. Clicking a building lights its floors one by one.
   - **Pixel art** (`SPR`, `PXC`, `pix()`): each drawing is an array of strings, one letter per pixel. Letters map to palette colours in `PXC`; `.` is transparent. `pix(name, k, swap)` turns it into a crisp-edged inline SVG (one `<rect>` per run of identical pixels, cached), where `k` is the on-screen size of one pixel and `swap = 'ab'` recolours `a` to `b` (flags, socks, petals). `thumb()` sizes a sprite for shop cards, and `DECOR[id].icon` is a sprite name. A `console.assert` checks that every decor icon exists and every letter is in `PXC`. To add an object, draw its grid in `SPR` and use `sp()` / `pix()` in its `html`. Light sources get the `lit` class: `sp(…, 'lit')`, or `lit(pix(…), cls)` outside `.sd`. At night only, `.lit::before` draws a flickering halo whose size is in `em`. `--gc`, `--gs` and `--gy` set its colour, size and height; `.lantern` and `.fish` are the pink and cyan variants.
   - Tab ids are historical: `#penguin` is Collection, `#deco` is Boutique. `#settings` (Réglages) is opened by the ⚙️ button in the header. `#outils` holds the ambience mixer (volumes, night button), to-dos (`S.todos`, linked to the session goal), flashcards (`S.cards`, Leitner boxes 0–4) and notes (`S.notes`). Flashcards: `#deckList` lists one button per subject (plus "Sans matière", which also holds cards of deleted subjects, see `subOf()`). A click opens the `#deckDlg` modal through `openDeck(sub)`; the runtime state `deck` (not saved) holds the card order, the 💔 cards (`ko`), the flip and the face swap (`back`). Clicking the `.flipcard` button flips it by toggling a class (no re-render, so the 3D animation plays). ❤️/💔 also move the card between Leitner boxes. At the end, the player can review the 💔 cards again (`openDeck(sub, deck.ko)`) or stop. During a running focus phase, clicking the companion toggles `#notesDlg` instead of talking: a non-modal floating copy of the notes (`#notesQuick`, same `S.notes`), dragged by its whole frame through `movable()`, position saved in `S.pos.notes`.
   - The "Aujourd'hui" card (`#stats`) sits at the top of the Stats tab. `renderStats()` builds the heatmap, the 7/30-day chart (`statRange`), the weekly goal (`S.weekGoal`), exams (`S.exams`, progress = sessions of that subject since `from`) and the companion's weekly review (`weekReview()`). `renderShop()` renders the category in `shopCat` from the `SHOP` table.
   - `renderAll()` starts with `checkAch()`, which unlocks achievements and friendship cosmetics. Toasts go through a queue, so several can fire in a row.
   - Every purchase goes through `buy(price, name)` (confirmation, debit, coin animation, `S.bought`).
8. **Events**:
   - One delegated `click` listener on `document` dispatches on `data-*` attributes of the clicked `<button>` (`data-tab`, `data-cos`, `data-adopt`, `data-decor`, `data-try`, `data-try-decor`, `data-preview`, `data-dress`, …). Clickable things must be buttons.
   - `change` events on dynamic inputs are delegated too.
   - Try-on and preview state (`preview`, `tryOn`, `tryDecor`, `tryTheme`, `dressing`, `shopCat`, `selSeed`) are runtime UI variables. They are not saved. `preview` also picks the companion shown in the Collection sheet (`selPet()`).

## CSS (style.css)

- Theming uses CSS variables on `:root`; the night mode is `body.night`, which overrides them. Colour themes (`body.theme-*`) only override accent variables, so they combine with night mode.
- `[hidden]` is forced to `display: none !important`, so the `hidden` attribute works on grid/flex components.
- Buttons use the fixed `--btn-ink` so pastel buttons stay readable in both themes.
- The rain overlay opacity comes from `--rain`, which `setVol` sets on `body`. The `orage` view forces it high.
- Rooms (`[data-chambre=…]`) and window views (`.v-*`) are the reference implementation of the design direction above.
- Room and season wallpapers are pixel art and are not in `style.css`. `ROOM_PX` in `app.js` describes the tiles of `douce`, `bois`, `neon` and `grenier` (`t(x, y)` = colour of one pixel, day and night); `FLAT_PX` holds day-only tiles for `fleurie`, `serre`, `zen` and the four seasons. `roomCSS()` draws them all at startup and injects `<style id="pxRooms">`. One pixel is `PX_EM` (3/16 em, like decor sprites at k = 3), so tiles scale with the room. A room can add `extra` CSS (grenier's roof slopes, néon's heart and window glow), shown only with no season (`[data-saison=""]`). Rugs are pixel ellipses from `rugBg(colour)`.
- The window is square with a pixel outline, and the skies use hard colour bands instead of smooth gradients.
- At night, `fleurie`, `serre`, `zen` and the seasons are darkened by a violet `mix-blend-mode: multiply` overlay on `.wall`/`.floor`, not by a brightness filter (a brightness filter turns them grey). The `ROOM_PX` rooms have explicit night colours instead.
- Overlays above the window (`.rain`, `.frame`, `.flash`) have `pointer-events: none` so clicks reach the city canvas.
- Pet positions in the room use `--px`, which changes when `.scene.has-partner` is set.
