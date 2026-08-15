# CLAUDE.md

## Project: Numeracy

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

### Mode 3: Exercise (the focus dial) — benched

**Off the menu.** It never became a game: the dial teaches, and everything built on top of it to make that fun only ever made it a better lesson. A menu is a promise about what is in there, and a lesson sitting beside five arcade modes mis-sells both. Benched rather than deleted, like Boss Rush — `core/exercise` and its scenes stay in the tree, with their tests, and the two routes that open it *on a named skill* still work: the Coach's PRACTISE for a skill with a bench, and the Playbook's per-skill drill. Those answer "help me with this one thing", which is the question the dial is actually good at. The rest of this section describes what is still in there.

The teaching mode, and the only one that is not a race — no HP, no clock, no combo. A problem opens downward into coarser versions of itself: DECONSTRUCT drops the ones out of focus, then the tens, until what is left is small enough to see whole (`679 + 834` → `670 + 830` → `600 + 800`). The player answers that rung, RECONSTRUCTs to bring the next place back, and answers again — so the answer arrives place by place and the carrying never has to be tracked apart from the running total. Solved rungs stay on screen, because `670 + 830` is only easy while `1400` is still in front of you.

The point is to make base-10 structure something the player performs rather than reads. Every other mode can be beaten by recall; this one cannot. Its output is `scaffoldDepth` — how far out the player had to zoom before the problem looked solvable — which falls as a technique internalises and reaching zero means they are solving these whole. Rating updates are gentle (half K) and untimed, since a mode that invites you to think must not read your pace as slowness.

All four operations ride the dial, each truncating what it honestly can. A sum drops the same place from both operands. A product splits one factor and holds the other whole (`47 × 6` → `40 × 6`, never `40 × 0`), which is partial products from the left. Division cannot ladder its operands at all — `700 ÷ 6` is not a whole number — so it ladders the *answer*, and the dividend shows what that answer accounts for: `600 ÷ 6 = 100`, `720 ÷ 6 = 120`, `738 ÷ 6 = 123`. That is partial quotients, with the dividend filling in as the player claims it.

Every rung carries a picture beside the digits, and each operation gets the one that is true of it. A product is a rectangle: the whole block is drawn, the claimed part lit and the rest dim, so breaking a place off lights the next slab and the block visibly assembles — that is the distributive law, and division reads the same drawing the other way, its slabs being partial quotients. A sum has no area, so it gets the exchange instead: every place holds a frame of ten slots, the two digits pour in, and what will not fit sits outside where it can be seen not fitting. Answering collapses the ten and sends one to the place above; subtraction runs it backwards, a column that cannot pay sending up for a ten that comes down and breaks into ten counters.

None of these pictures resolve before the player answers. A frame that had already collapsed its ten, or a slab wearing its own product on arrival, would be handing over the digit the rung is asking for — so the shape and the operands are the help, the result is the work, and the animation is what the arithmetic buys. Pictures are pure functions of the rung (`core/exercise/places.ts`, `areaPanesFor`) and are tested against the rung's own answer, so the counters on screen can never disagree with the number being typed.

Recall skills are deliberately withheld: the times tables and exact division can all be opened by the dial, but teaching a procedure for a fact that ought to be remembered is the opposite of what tracking them per-family is for. A test forces a ruling on every skill the dial can open, so omission is never a decision by default.

Fractions are worked on a second bench, because their problem is different in kind: halves and thirds do not fail to add because the numbers are big but because the slices are different sizes, and no amount of zooming out changes that. So the fraction skills get bars — a length of ground, cut into slices, some of them filled — and two verbs. RESLICE cuts every slice of a bar into `k`; MERGE fuses `k` back into one. Both leave the bar covering exactly the same ground, which is the whole lesson: `3/6` is not a new number, it is `1/2` wearing more cuts. Five skills fit (adding like and unlike fractions, common denominator, percentage, reducing); `frac.of`, `pct.of` and `pct.what` do not, because they cut a quantity into groups rather than a bar into slices.

Both benches share a set: eight problems, one gentle untimed rating attempt each, and a record of how much help was needed. Neither reaches the leaderboard — a set worked at your own pace is not comparable with a run against a clock.

Rebuilding is automatic. There is only ever one place to bring back and one moment to bring it, so asking for a keypress was a formality; the ladder walks itself down as the player answers. Breaking a problem apart stays the player's decision, because that one is a real choice — and answering the whole thing without breaking it is always allowed, since the mode exists to become unnecessary.

### Mode 4: Cages

KenKen, essentially — the puzzle Tetsuya Miyamoto built in 2004 to teach arithmetic by refusing to teach it. (The name is trademarked; ours is Cages, and the generic names are Calcudoku and MathDoku.) A Latin square carved into regions, each carrying a target and an operator: "these three multiply to 24". Nothing is offered as a choice, so nothing can be picked by eye — placing one digit means finding which factorisations fit the cage and which of those survive the row. Generation retries until the solver proves exactly one solution exists, because a puzzle with two answers can tell a player they are wrong for being right.

A run is one grid and the result is the time on it, which goes on its own board — the first board in the game where the smallest number wins, so ranking direction is a property of the mode (`MODE_RANKING`) rather than something each caller remembers. The clock is wall time, not accumulated frame deltas: Phaser smooths and caps `delta`, so a machine dropping frames would otherwise post records for being slow. It stops while the rules or the worked example are open, which the scene gets for free by pausing. Ratings stay untimed even though the run is not — time between cages is mostly deduction, and charging that to the seven times table would teach the model something false.

The rules fit in two lines and knowing them still leaves a player with no idea what a move looks like, which no amount of rewording fixes. So the mode demonstrates itself: a worked 4x4, one forced digit at a time, each step naming the cage or the line that forced it. It runs once on first entry and lives on `E` after that. The example and its reasoning are data in `core/cages/example.ts`, and the tests prove every digit it writes was forced — an example that leaps is teaching guessing.

### Factor Storm

Asteroids, with the rocks wearing composites. Type a factor of the rock under your nose and it splits into that factor and the quotient — `84` into `12` and `7`, which split again — so the board **multiplies before it clears**, and a wave is a factor tree worked leaf by leaf until only primes are left to die. Flight is Newtonian rotate-and-thrust on a wrapping field (`core/flight`, shared with Collapse): facing and velocity independent, W along the nose, near-frictionless. The first control scheme was direct WASD so the left hand could fly alone; it was replaced because accelerating along the input axis made every turn also a thrust.

The asymmetry is the whole mode: **a composite can never be shot by its own name** — it accepts only proper factors, and typing what it says dead-ends with `NOT PRIME — BREAK IT` — while a prime accepts *only* itself. This shipped wrong once, and the mode was a transcription exercise: the fastest play was copying digits off the screen, and the test that should have caught it had encoded the exploit and passed. `1` is never legal, and no fragment of 1 can exist.

Aiming is steering: the gun locks whatever the nose points at (`pickByNose`), because proximity is the one thing the player does not control. Bearings are computed across the wrap seam, hysteresis stops two straddled rocks strobing, and a tight snap cone overrides both the hysteresis *and* a half-typed buffer — swinging onto a new rock drops the typed digits silently, because re-aiming is not a mistake. The buffer holds while it could still grow into a legal shot, so a rock of 63 lets you reach 21 without the 2 going off on the way.

Rocks up to 24 wear their quantity as counters arranged in their **squarest rectangle** (`core/factor/lattice.ts`) — Euclid's own definition, not a teaching aid bolted on: a composite is a number that makes a proper rectangle, a prime is one stuck as a single line. The cap is physical (counters need pixels), which turns the difficulty curve into an abstraction ladder: quantity while quantity is legible, symbols after. Naming a factor opens the counters into that many piles before they scatter.

Every split credits `div.exact` plus the larger factor's table; primes credit `factor.prime`, which nothing else in the game can rate. The hidden-factor skills (`factor.smallest`, `factor.deep`) only credit when the split was not given away by an even digit or a trailing 5. A rock that reaches the ship is rated as an **unanswered question** — once per rock, however many times it hits, against the split the player was meant to find — because before that ruling every factor rating in the game came from a correct attempt and could only climb. Wrong digits are deliberately unrated: every digit is a live guess in this input model, and a mode that quietly downgraded exploration would teach timidity. Nuked rocks rate nothing and pay nothing, the same ruling Polarity makes for cancelled bullets. Balanced splits pay double (finding a middle factor is the harder step) and primes pay most, being the tail that has to be recognised rather than reduced. Rock values are drawn from the player's weakest table families, weighted but always diluted — a wave is never a wall of the worst one.

### Collapse

Twin guns over the same Newtonian field: fraction tokens and percentage tokens drift together, and a pair annihilates when one is armed with **its own** gun and its equivalent is then shot with **the other**. Arming works from either side, so the conversion drills in both directions. The loaded gun also decides what is solid — the ship phases through tokens of its own colour and is killed by everything else — so a swap flips both halves of the game at once: what you can shoot, and what can shoot back. The swap carries a short fire lockout, because committing to a half of the field is the decision the mode is actually about. This is the two-state ship Polarity's section refers back to.

The pool (`core/collapse/equiv.ts`) holds only terminating equivalents — a mode built on "push it into the exact match" cannot afford `1/3`, which has no exact match to push into — and percentages are unique within a wave, so every fraction has exactly one home and a mis-push is unambiguously a misread rather than a coin flip. The pool is shared: Meteor Defense generates its fraction→percent problems from the same `EQUIV_POOL`, because two pools would drift and a player drilled on one set and rated on another is being told something untrue about what they know.

What is rated is chosen as carefully as what is not. Latency runs from the moment the charge was armed — that is when the question was asked; everything before it was flying. A mismatch is a genuine wrong answer and rated as one, against the fraction, since that is the form being read. A wrong-gun shot is *not*: firing the fraction cannon at a percentage is a fumble, and rating it would teach the model that a player who cannot aim cannot do fractions — it simply does not bite, checked before anything else. An unreduced fraction (`6/8` for 75%) credits `frac.reduce` on top and rates harder, because reading through it is a second step.

Scoring is a chain of tiers rather than a smooth curve, so every crossing is an event the audio can land on — a number that creeps up is not something a player can feel. And because this is the only mode where the player aims, distance pays: a threaded cross-field shot earns a share of whatever the collapse was already worth (LONG SHOT / SNIPER / DEAD EYE), judged on ground the bolt actually covered since bolts wrap, and only on the completing shot — the arming shot scores nothing, so a bonus there would have nowhere to land. The top tier sits deliberately at the edge of the gun's range, and a test holds it reachable.

### Kakooma

Every other mode asks the same question — here is a problem, produce the answer. Kakooma (Greg Tang's puzzle) inverts it: here are nine numbers, and exactly one is the sum (or product) of two of the others — *find it*. A single cell costs dozens of mental sums and the player experiences it as searching, with the arithmetic as a side effect. That makes it the complement to Meteor Defense rather than a variant: knowing 7+8=15 on cue and spotting that a 15 is sitting near a 7 and an 8 are different skills. Solved cells collapse to the number they were hiding, and when the ninth falls the survivors form the final three-by-three — the grid literally becomes its own last puzzle, no second screen needed to explain it.

No HP; the clock is the run. Ninety seconds, a bonus per cleared grid, a four-second bite per wrong call — sized so that with nine numbers on offer, guessing is slower than looking. This is a fluency mode on purpose; Exercise already owns thinking slowly. The numpad is the fast path twice over — a 3×3 of cells has exactly the shape of a numpad, and so does the 3×3 inside each one — but the second stage types the **value found, not the position**: positional digits shipped first and broke the project's own natural-mapping rule (a player who found a 20 typed "20" and was charged for it). Prefixes wait rather than fire — the buffer commits only when no longer number on the board starts with it, ENTER claims the short one — because firing on a unique prefix left the trailing 0 arriving with nothing to mean, buzzing at a player who had done exactly the right thing.

Rating goes to the fact that was found, not the cell it was in, mapped finest-reading-first (`add.complement10` for an exact ten, `add.bridge` across it, tables by the larger factor) — but with a **search premium** per number in the cell, because the same fact under a search load that grows with the cell is a harder question, and rating it bare would let the mode inflate the table. Every call rates, right or wrong: pointing at a number and saying it is the sum of two others is a real claim.

Generation is constructive and backwards — final cell first, each sub-cell built to land on one of its numbers, distractors admitted one at a time and refused if they create a second relationship, since "exactly one" is a property of the whole set and nine random numbers under twenty collide constantly. The sum is bounded rather than the addends, which is what stops the answer being findable by picking the largest number on screen (a test holds that rate under 60%). Product cells plant only times-table facts and draw their distractors from factors and the products they make — a board half full of numbers nobody would consider as a factor is a search collapsed into a glance. A repeated number appears only to put a double on the table. The generator widens its range rather than fail, because a player cannot tell a stalled generator from a broken game.

### Polarity

Ikaruga, and specifically the half of Ikaruga that Collapse does not already have. Collapse has the two-state ship, the swap lockout and phasing through your own colour; what it lacks is absorption as a resource and a chain scored on the *order* of kills, which is what makes Ikaruga a puzzle rather than a filter.

Two channels, with a divisor pair standing in for black and white. **Carriers** come down wearing numbers and can only be broken by a ship wearing a divisor of them — the wrong polarity rings off, and a soft version where any shot chips would let a player clear the field without deciding anything, which is the mistake that benched Boss Rush. **Bullets** are what carriers throw back: one wearing a number your divisor divides is absorbed and charges the meter, anything else costs a hull point. Three kills of one colour make a chain link, each paying double the last.

The tension is the design, and it is Ikaruga's: **a carrier fires the colour it is not**. Wearing ×3 lets you break the ×3 carriers, and those carriers are throwing ×4 bullets that will kill you while you wear it. The colour that lets you attack is the colour that leaves you exposed, and flipping to eat the fire is the thing that stops you killing anything. Neither state is ever simply correct.

Numbers divisible by **both** are the mode's one idea. A bridge carrier breaks in either state and closes a link of either colour; a bridge bullet is safe whichever way you face. Common multiples become the lane through the field, so the player flies through an LCM rather than computing one. Wilds — divisible by neither — are safe in no state and exist to keep a hand on the movement keys.

The arithmetic is said out loud. Every kill prints the division that did it — `84 ÷ 7 = 12` — because the mode asks a yes/no question all run and the quotient never appears anywhere otherwise. Every bounce prints the remainder: `85 ÷ 7 LEAVES 1`, which corrects the player by telling them how far off they were rather than just that they were.

Five guns, and each changes *which numbers you can reach* rather than just how fast the field empties. BOLT is the accurate, endless baseline everything else is priced against. GATLING shreds whatever you are standing under, sprays at anything you are not, and is gone in eight seconds. SPREAD checks a fan instead of a column. LANCE pierces and bites every carrier in the line the divisor divides. SEEKER only ever chases valid targets, so watching a bolt swerve past a 46 to reach a 42 is the answer demonstrated rather than handed over.

The prices are a rule, not a vibe, and a test enforces it: **an accurate pod may never beat BOLT at plain single-target output.** GATLING is the one exception and pays for it twice, in a wobble on every bolt and in a magazine that empties while you are still enjoying it. There is deliberately **no screen-clear** — one existed, it was the best gun in the game by a distance, and a button that deletes the wave's whole arithmetic is the opposite of what a mode about reading numbers should reward. Every gun has to be aimed at something. Pods wear a diagram of what the gun does rather than the first letter of its name, because three of the five began with S and a pickup has to be read while it falls past you.

Pressure is a curve rather than a constant (`core/polarity/heat.ts`), and it is asserted rather than felt out. The first two waves aim every shot — one bullet with an obvious origin is how you learn that colour decides whether it hurts — with fans at wave three and rings at five, growing from six bullets to twelve. Wave one also fires at two thirds pace and keeps wilds scarce, since early on the lesson is "read the colour" and a wild is the one bullet where reading it does not help. Every knob is monotonic in the wave number and every one of them caps.

Two things borrowed from CAVE, which is the house the genre was built in. **Focus** (hold F) crawls the ship for threading and blows up the hitbox marker, costing mobility rather than firepower. And the **bullet cancel**: break a carrier and the fire around it stops being a threat and becomes points streaming home. Cancelled shots are wiped *without being judged* — the player never chose to take or leave them, so grading them would be inventing a decision, the same ruling Factor Storm makes about a nuke. Carriers throw geometry rather than single shots: aimed, then fans, and rings from the bridges, because a pattern whose shape you can read is a pattern you can find the gap in.

Movement is direct eight-way with no drift and no wrap, a third movement model on purpose: Newtonian flight makes a misread unavoidable, and a ship that reappears on the far side has teleported out of a pattern authored to be survivable where it stood. It is deliberately fast — at half the current speed a tap moved the hull less than its own width and the mode read as having no controls at all.

**Nothing here credits `mul.table.*`.** Recognising 84 as a seven and recalling 7×12 are different memory processes that barely prime each other, so the mode gets its own skills: `div.by.3`, `div.by.4`, `div.by.7`, `div.by.11`, cut by the *method* the recognition needs rather than by the divisor, with composites crediting their parts. Two is not in the divisor pool at all: "is it even" is the fastest read in arithmetic and the surface heuristic the mode exists to defeat, so a wave declared on it would have half the thinking removed. Five stays as the gentle half of an opening pair and rates nothing, for the same reason.

**Only bullets are graded.** Shooting is an assertion too, but one where just half the mistakes are observable: a bounce is a visible false alarm, while a carrier the player quietly declined to shoot leaves no record. A channel that sees one error type and not the other biases every estimate drawn from it. Bullets arrive by the dozen and resolve into all four cells, so they carry the measurement and the gun is left to be a gun.

The rating is where the work went. A binary judgement is a coin flip, so nothing is rated per bullet: each divisor keeps a signal-detection ledger and is cashed for `d' = z(H) − z(FA)`, mapped through `Φ(d'/√2)` — already the guess-corrected proportion correct, so `d' = 0` lands on 0.5 and moves nothing. Flying into everything and dodging everything both score exactly zero, so no separate mashing detector is needed; a ledger that gave one answer to everything is refused outright, which is also what stops a player being credited for a divisor they never wore. Ledgers cash on a trial budget rather than at a wave boundary, because sensitivity over eight trials and over twenty are not the same number. A bridge taken under one divisor credits that divisor alone. Every attempt is `untimed`, so these skills never bank fluency and recognition can never unlock a mastery milestone.

Waves are authored and their numbers are not: GAUNTLET is the same shape every time so its route can be learned, while the pair it is declared with and the values filling it adapt. A fill is checked for chainability, a ram-free path and sufficient candidates before it ships, the same bargain Cages makes with its solver — a player cannot tell an impossible wave from one they failed. Carrier fire is generated as a wave runs, so its dodgeability is bounded by a cap on bullets in the air rather than proven. A controlled share of each wave is heuristic-proof, since under pressure players fall back on parity and last-digit checks, and non-multiples are pulled toward the near misses because 85 is a far harder thing to keep off than 60.

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

No base building, and — since save v4 — **nothing purchasable touches a run**. The shop originally sold stat upgrades (+2 HP, a slow field, a free miss, a spread cannon); they were retired and refunded, because two runs are only comparable if both players brought the same ship, and a board topped by whoever ground credits first measures patience rather than arithmetic. The old price list survives in exactly one place, the save migration, so a v3 profile gets its credits back rather than discovering its gear silently deleted.

- Runs earn currency on performance (`creditsForRun`; Cages needs its own formula because its score is a duration and paying per point would pay most to the slowest)
- Every advantage is an **in-run drop** (`core/drops`): freeze, nuke, repair, double, chain, shield — timers rather than permanent state, so a run's texture comes from what is active now, not what the player owns. Pools are per mode and tested, because the tempting failure is keeping a pickup in a pool and quietly giving it no effect: chain is meteor-only ("one answer kills everything sharing it" needs meteors that share an answer). How you catch one matches the mode — a pod to slide under, a float to fly through, or handed over on the solve in the keyboard-only modes
- Credits buy **cosmetics that change nothing**: five slots (hull, trail, cannon, burst, badge), one free starter each. A hull is an outline in ship-radius units so a bought silhouette can never change the collision circle — looking different is the product, being bigger would be an advantage, and advantages are not for sale. Tests hold this
- Part of the catalogue will not sell at any price until the save's own record earns it (lifetime waves, best score, skills mastered) — a catalogue you can buy front-to-back with enough grinding is just a long receipt. Locked tiles are countdowns, not walls, and the shop reports `locked` before `insufficient`, so the player grinds the right thing
- Milestones surfaced from the skill table ("12s mastered") appear as unlocks in the operator debrief
- Economy code lives in core/economy, testable, tunables in config

## Aesthetic Rules

- Palette: hot magenta, cyan, deep purple, black, with white/yellow for critical info. High contrast, readable at speed
- CRT pipeline is always on by default with a toggle in settings (accessibility), and every effect has its own dial on the video screen
- Colour is never the only carrier of meaning. The two-channel modes give every class its own silhouette, and the channel pair itself is a setting (`core/settings/channels`): magenta/cyan by default, amber/blue for the one player in twelve who cannot split the default pair at speed. Bridge-yellow and wild-red never move — those meanings were never the problem
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
7. Currency earned per run and a purchasable catalogue (shipped as upgrades, re-ruled cosmetics-only at save v4 — see RPG Meta)

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
