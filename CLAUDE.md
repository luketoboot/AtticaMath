# CLAUDE.md

## Project: Arcade Math Game (working title)

Browser based arcade arithmetic game. Hotline Miami aesthetic: CRT shader, neon on black, synthwave soundtrack (provided by the owner, do not generate music). Target audience is elementary students through adults. No kid theming anywhere. Difficulty is fully adaptive, driven by a per skill rating model. The game never displays grade levels.

Desktop and web, played on a keyboard. Mobile via Capacitor was considered and dropped: the core input is a continuously watched digit buffer, and the flight modes want a hand on WASD and a hand on the numpad at once, so a phone version would have to be a different game rather than a wrapper. Touch code already in the tree (`FlightPad`, `Numpad`, the boss pad) stays and still works, but nothing new needs to be sized for a phone. Keeping the bundle small is still a rule — it is a web game, and the download is the first impression.

## Tech Stack

- TypeScript, strict mode
- Phaser 3 for the game runtime
- Vite for dev server and bundling
- WebGL post processing pipeline for the CRT effect (scanlines, barrel distortion, chromatic aberration, phosphor glow, slight vignette)
- No backend for MVP. All state in localStorage behind a storage adapter interface so a server sync can be added later without touching game code
- Vitest for unit tests on the math and rating systems
- No heavy asset pipelines. Prefer generated/procedural visuals and small sprite sheets. Target under 2MB initial bundle

## Architecture

Keep game logic and rendering strictly separated. The simulation (problem generation, skill model, wave composition, scoring) must be pure TypeScript with no Phaser imports, fully unit testable. Phaser scenes consume the simulation through a thin interface.

```
src/
  core/           # pure logic, no Phaser
    skills/       # skill taxonomy, Elo style ratings, update rules
    generator/    # problem generation, difficulty estimation
    waves/        # wave composition and pacing
    coach/        # tip selection driven by skill table
    economy/      # currency, weapons, upgrades
    save/         # storage adapter, versioned save schema
  game/           # Phaser scenes, entities, input
  fx/             # CRT pipeline, shaders, particles, screen shake
  ui/             # HUD, menus, operator dialogue
  audio/          # music/SFX manager (music files supplied externally)
```

## Adaptive Skill Model

This is the heart of the game. Implement it first and test it hard.

- Atomic skill taxonomy. Each skill gets its own rating. Examples: add single digit, add bridging ten, add two digit, subtract with borrowing, times tables per family (2s through 12s tracked separately), multiply 2x1 digit, multiply 2x2, multiply 3x2, multiply 4 digit, divide exact, divide with remainder, order of operations. Store the taxonomy as data, not code, so skills can be added without refactoring.
- Elo style ratings per skill. Each generated problem has a difficulty derived from its component skills and operand sizes. Player hit/miss updates the relevant skill ratings.
- Response time is part of the signal. A fast correct answer moves the rating more than a slow correct answer. Define a target latency per difficulty band and scale updates by actual vs target.
- Wave composition: roughly 70% fluent skills (fast, fun), 20% frontier skills (near the rating edge), 10% decayed review (skills not seen recently). Percentages are tunables in config, not constants scattered in code.
- Cold start: first 2 to 3 waves are a stealth placement sweep from trivial to hard. Seed ratings from where response times fall off. Never ask the player their age or grade.
- All rating math lives in core/skills with full unit test coverage. This code must be deterministic and seedable for testing.

## Game Modes

### Mode 1: Meteor Defense (build first)
Math problems fall from the top as meteors. Player types the answer. The input buffer is watched continuously and fires the moment it matches a live meteor's answer. No enter key. Wrong digits cost only time. Meteors that reach the ground damage the base HP. Escalating speed within a wave, breather between waves.

Input details matter: numpad and top row digits both work, backspace clears the buffer, buffer displays on screen as the current "charge". If two meteors share the same answer, the fired shot hits the closest one.

Stamina is the price of a wrong answer beyond time. Because the buffer fires on match, mashing digits is otherwise a real strategy — spray enough at a full field and some land, and the only cost was combo clock. So a dead-end buffer (digits no live answer even begins with, which is this game's version of committing to a wrong answer) also costs stamina. It regenerates on its own after a short delay, so a player doing arithmetic never sees the meter move far; empty it and the buffer stops accepting digits until it recovers past a threshold. The lip on recovery is deliberate — unlocking at zero would let a masher tap one digit per frame forever. Rejected keys buzz; they are never silently swallowed. Tunables in `config.stamina`, logic in `core/stamina.ts`.

### Mode 2: Expression Builder (second)
A target number falls. The player has ammunition: a hand of numbers and operators. They compose an expression that evaluates to the target and fire it. Multiple valid solutions exist; award bonuses for ammo efficiency and operator variety. This is Countdown numbers round as an action game. Same skill model feeds it, and which operators the player avoids is itself a rating signal.

### Mode 3: Exercise (the focus dial)
The teaching mode, and the only one that is not a race — no HP, no clock, no combo. A problem opens downward into coarser versions of itself: DECONSTRUCT drops the ones out of focus, then the tens, until what is left is small enough to see whole (`679 + 834` → `670 + 830` → `600 + 800`). The player answers that rung, RECONSTRUCTs to bring the next place back, and answers again — so the answer arrives place by place and the carrying never has to be tracked apart from the running total. Solved rungs stay on screen, because `670 + 830` is only easy while `1400` is still in front of you.

The point is to make base-10 structure something the player performs rather than reads. Every other mode can be beaten by recall; this one cannot. Its output is `scaffoldDepth` — how far out the player had to zoom before the problem looked solvable — which falls as a technique internalises and reaching zero means they are solving these whole. Rating updates are gentle (half K) and untimed, since a mode that invites you to think must not read your pace as slowness.

All four operations ride the dial, each truncating what it honestly can. A sum drops the same place from both operands. A product splits one factor and holds the other whole (`47 × 6` → `40 × 6`, never `40 × 0`), which is partial products from the left. Division cannot ladder its operands at all — `700 ÷ 6` is not a whole number — so it ladders the *answer*, and the dividend shows what that answer accounts for: `600 ÷ 6 = 100`, `720 ÷ 6 = 120`, `738 ÷ 6 = 123`. That is partial quotients, with the dividend filling in as the player claims it.

Every rung carries a picture beside the digits, and each operation gets the one that is true of it. A product is a rectangle: the whole block is drawn, the claimed part lit and the rest dim, so breaking a place off lights the next slab and the block visibly assembles — that is the distributive law, and division reads the same drawing the other way, its slabs being partial quotients. A sum has no area, so it gets the exchange instead: every place holds a frame of ten slots, the two digits pour in, and what will not fit sits outside where it can be seen not fitting. Answering collapses the ten and sends one to the place above; subtraction runs it backwards, a column that cannot pay sending up for a ten that comes down and breaks into ten counters.

None of these pictures resolve before the player answers. A frame that had already collapsed its ten, or a slab wearing its own product on arrival, would be handing over the digit the rung is asking for — so the shape and the operands are the help, the result is the work, and the animation is what the arithmetic buys. Pictures are pure functions of the rung (`core/exercise/places.ts`, `areaPanesFor`) and are tested against the rung's own answer, so the counters on screen can never disagree with the number being typed.

Recall skills are deliberately withheld: the times tables and exact division can all be opened by the dial, but teaching a procedure for a fact that ought to be remembered is the opposite of what tracking them per-family is for. A test forces a ruling on every skill the dial can open, so omission is never a decision by default.

Fractions are worked on a second bench, because their problem is different in kind: halves and thirds do not fail to add because the numbers are big but because the slices are different sizes, and no amount of zooming out changes that. So the fraction skills get bars — a length of ground, cut into slices, some of them filled — and two verbs. RESLICE cuts every slice of a bar into `k`; MERGE fuses `k` back into one. Both leave the bar covering exactly the same ground, which is the whole lesson: `3/6` is not a new number, it is `1/2` wearing more cuts. Five skills fit (adding like and unlike fractions, common denominator, percentage, reducing); `frac.of`, `pct.of` and `pct.what` do not, because they cut a quantity into groups rather than a bar into slices.

Both benches share a set: eight problems, one gentle untimed rating attempt each, and a record of how much help was needed. Neither reaches the leaderboard — a set worked at your own pace is not comparable with a run against a clock.

Rebuilding is automatic. There is only ever one place to bring back and one moment to bring it, so asking for a keypress was a formality; the ladder walks itself down as the player answers. Breaking a problem apart stays the player's decision, because that one is a real choice — and answering the whole thing without breaking it is always allowed, since the mode exists to become unnecessary.

### Daily Challenge

Meteor Defense on a seed the UTC date decides. One run per day, one shared board per day.

The mode exists on one guarantee: everybody plays the identical run. That puts it in direct conflict with the rest of the game, where waves are composed from the player's own skill table — a veteran's wave 5 and a beginner's wave 5 would share a number and nothing else, and ranking those against each other would be theatre. So the daily gets its own composer (`composeDailyWave`) which never reads a rating, laddering difficulty by wave number alone out of the date's seed, and the run forces the pace level, the skill filter, and placement-off, since each of those changes what a score is worth. Attempts still update the skill table: *reading* the table breaks comparability, writing to it is just the run being honest signal.

The attempt is spent when the base falls, not when the score uploads — a failed submission leaves the score pending and retried from the lobby, never a second run at a roster you have now seen. Daily scores stay off the all-time meteor board for the same reason exercise sets do: they were not the same game.

The board is Supabase, reached with `fetch` against PostgREST rather than `supabase-js`, which would cost ~100KB for two queries and an insert. With `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` unset the board falls back to device-local and says so on screen, so a clone with no `.env` is still a complete game. Schema and its row-level security live in `supabase/migrations/`.

### Later modes (design stubs only)
- Estimation mode: problems fall too fast to compute exactly, fire at closest of three answers
- Boss fights are built but benched pending a redesign around a demanded number; Factor Storm shipped. See git history and the note in `MenuScene`.

## Coach ("The Operator")

A synthwave AI operator that speaks between waves only, never interrupts play. Driven entirely by the skill table: lowest rated skill with recent attempts becomes the tip topic. Tips are short, concrete tricks (9s finger trick, doubling for 4s, compensation for near tens). After a tip, the next wave quietly overweights that skill. Tip content lives in a data file keyed by skill id. Tone: terse, cool, a little dry. Never condescending, never school flavored.

## RPG Meta

No base building. Loadout and upgrade system only.

- Runs earn currency based on performance
- Weapons change how answers interact with the field: spread cannon (hits all meteors sharing the typed answer), slow field, one miss shield, streak multiplier that ramps on consecutive correct answers
- Loadout picked before a run, permanent upgrades bought between runs
- Milestones surfaced from the skill table ("12s mastered") appear as unlocks in the operator debrief
- Economy code lives in core/economy, testable, tunables in config

## Aesthetic Rules

- Palette: hot magenta, cyan, deep purple, black, with white/yellow for critical info. High contrast, readable at speed
- CRT pipeline is always on by default with a toggle in settings (accessibility)
- Screen shake, hit flash, particle bursts on kills. Juice matters. Every correct answer should feel like a kill in an action game
- Typeface: chunky pixel or condensed retro face, must stay legible for multi digit numbers at small sizes
- No clip art, no cartoon mascots, no school iconography

## Coding Conventions

- Strict TypeScript, no any
- Pure functions in core/, side effects only in game/ and fx/
- All tunables (wave percentages, rating K factors, speeds, economy prices) in a single typed config module
- Seeded RNG everywhere in core/ so runs are reproducible in tests
- Unit tests required for: rating updates, problem generation ranges, wave composition distribution, expression evaluation, economy math
- Small commits, conventional commit messages
- No external state management library. The simulation is the state

## MVP Definition

1. Meteor Defense mode, playable start to game over
2. Adaptive skill model with cold start placement
3. CRT shader pipeline
4. Basic HUD: HP, score, streak, input buffer
5. Operator tips between waves (data driven, at least 15 tips covering add/subtract/multiply)
6. localStorage saves with versioned schema
7. Currency earned per run and at least 3 purchasable upgrades

Expression Builder is milestone 2. Nothing else until both modes feel good.

## Non Goals for MVP

- Still no accounts. The daily board is the one server-backed feature and it deliberately has no login: an anonymous insert policy and a per-device id, nothing to sign up for or recover. Every other board stays local.
- No mobile packaging, ever — see the top of this file for why it was dropped rather than deferred.
- No music generation (owner supplies tracks; build a music manager that loops supplied files with beat synced intensity layers if easy, otherwise simple looping)
- No base building, ever

## Dev Commands

- `npm run dev` — Vite dev server
- `npm run test` — Vitest unit tests (core/ only)
- `npm run build` — typecheck + production bundle
- `npm run audio` — reconcile the sample table against `public/sfx` and `public/music`.
  Missing samples fall back to synthesis by design, so a typo'd filename is silent;
  this fails on that and on any file nothing references. Optional alternate takes are
  reported, never failed on.
- `npm run shot -- <Scene|all>` — render a scene to `shots/*.png` in headless Chromium
  (real WebGL, real CRT pipeline). `--kind=hull` passes scene data, `--save '{"credits":0}'`
  overrides the save fixture. Shots are deterministic, so `--golden` blesses a baseline and
  `--check` fails on any visual change. Use this to verify layout instead of guessing.
