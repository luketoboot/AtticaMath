# Arcade Loop Design — combos, pacing, Expression rules, Factor Storm

Design notes for the second gameplay pass. Written against the code as of
`094a552`. Every number here is a proposed default for `core/config.ts`, not a
constant to inline.

---

## 1. What the good ones actually do

Seven principles, each with the game it comes from and what it means here.

**1. Every keystroke pays out, not every answer.**
ZType's author took the id Software lesson literally — "every shot you take,
every keystroke, is as satisfactory as possible." Our atomic input is a *digit*,
but only a completed answer produces feedback. A digit that keeps a live
prefix-match should light up: buffer glows, matching meteors lock on with a
target bracket, pitch rises per digit. This is also a readability fix — right
now nothing tells you which meteor you are about to hit.

**2. Always decide in the player's favour.**
ZType shrinks collision boxes below the sprite: "missing looks fine, getting hit
unfairly does not." Our version is buffer forgiveness — a digit that matches no
live meteor's prefix clears the buffer immediately with a buzz instead of
stranding you in a dead string you must backspace out of. Matches the standing
rule that inputs buzz on invalid and are never silent.

**3. The multiplier has to be losable.**
Geometry Wars ties the multiplier to your life: die and the whole thing goes.
That risk is the tension. Ours resets only when a meteor lands, which is rare
and arrives too late to feel connected to play. It needs a decay timer (§2).

**4. Speed is a reward, not just a clock.**
Pac-Man CE DX raises the speed of play when you eat a ghost train — playing well
makes the game faster, which makes it worth more. Ours ramps on wave number
only. Coupling pace to the combo tier is the single biggest pacing fix available
and it is self-balancing: a struggling player automatically gets a slower game,
which is the same adaptive philosophy as the rating model, applied to tempo.

**5. Assist that still costs you.**
CE DX slows time when a ghost is about to catch you, but the clock keeps running
in real time. Free tension with no unfairness. Ours: a meteor entering the last
0.8s of its fall dilates time ~50%, while the combo timer keeps draining.

**6. Choice under pressure beats raw speed.**
ZType's fun is partly deciding which enemy to kill first. Our targeting is
automatic and answer-driven, so the choice has to be authored in: marked "hot"
meteors worth more, drawn from frontier skills (§2).

**7. Variety on a schedule.**
Vampire Survivors offers a build choice every level-up; Devil Daggers upgrades
at fixed gem thresholds. Neither is random loot — both are *paced* choice. Ours:
one of three temporary boons at each breather, plus in-wave drops.

A global rule that falls out of all of this, and that the game should never
break: **mistakes cost time, never progress.** Wrong digits, misfires, invalid
expressions — all of them burn clock and combo, none of them take HP, chips, or
rating. Difficulty comes from the falling, not from punishment.

---

## 2. Meteor Defense — pace and combo

### Current numbers and why they feel slow

`baseFallSeconds: 14` plus a difficulty bonus of up to ~8s, `baseSpawnGap: 3.2`,
`maxConcurrentMeteors: 4`, `breatherSeconds: 6`, 8 problems in wave 1. Wave one
runs about 40 seconds with at most a few rocks visible and long gaps of nothing.
`streakStep: 0.1` to a `maxStreakMultiplier: 3` means the multiplier moves too
slowly to notice and only breaks on a landing.

### Retuned baseline

| key | now | proposed |
| --- | --- | --- |
| `meteors.baseFallSeconds` | 14 | 10 |
| `meteors.baseSpawnGapSeconds` | 3.2 | 2.2 |
| `meteors.minSpawnGapSeconds` | 1.4 | 0.9 |
| `meteors.maxConcurrentMeteors` | 4 | 5 (+1 per 2 combo tiers, cap 8) |
| `meteors.breatherSeconds` | 6 | 3.5, skippable with any key |

The skippable breather matters more than the number: let the player set their
own tempo. Show `[ SPACE ] LAUNCH NEXT WAVE` under the Operator tip.

### Combo meter

Replaces the bare streak counter. Lives in `core/combo.ts` as a pure reducer —
`tick(state, dt)`, `onKill(state, opts)`, `onWrongDigit(state)` — fully testable.

- Correct answer: `combo += 1`, timer refills to
  `comboWindowSeconds` = `4.5 - 0.5 * tier`, floored at `2.0`. (Shipped at
  `0.5`, not the `0.15` first drafted — with only five tiers a 0.15 step was
  too small for the tightening to be felt at all.)
- Timer hits zero: combo resets to 0 with a "cooling" sound and the bar drains
  visibly for the last second so the reset is never a surprise.
- Wrong digit: `-0.5s` off the timer. No combo loss. This is what "wrong digits
  cost only time" should mean mechanically.
- Meteor lands: combo to 0 outright, as now.
- Taking a meteor bullet: combo halved, not cleared. Dodging is a separate
  skill; it should sting without erasing a math run.

Tiers at combo 4 / 8 / 12 / 16 → multiplier ×1.5 / ×2 / ×3 / ×4, overdrive at
20. Tiered rather than the current smooth ×0.1 step because a tier crossing is
an *event* — it can flash, pitch up, and change the music layer. A smooth ramp
has nothing to celebrate.

### Pace coupling

Per combo tier: fall speed `×(1 + 0.08 * tier)`, spawn gap `×0.92^tier`,
`maxConcurrent + floor(tier / 2)`. Caps at the tier-4 values so overdrive is
fast but not unreadable.

### Overdrive (combo 20)

Five seconds where all descent freezes but spawning continues and every kill
scores at max multiplier — the Tetris Zone idea. It reads instantly, it is a
pure reward, and it ends with a screen-clear pulse and a score tally. Crucially
it does not make the *math* easier, so it can't be used to dodge a problem the
player can't do.

### Hot meteors

One or two per wave, flashing gold, drawn from the player's **frontier** skills
(the wave composer already classifies these). Killed above the midline: ×3
score and +2 combo. Killed low: normal value.

This is the pedagogy hidden inside the scoring: greed points at the hard skills,
and the player experiences it as risk appetite rather than as remediation. It
also gives §1.6's "which one first" choice a real answer.

### Drops

Roughly 1 per 12 kills, from marked carrier meteors. The pickup falls slowly and
is collected by moving the cannon under it — which gives the existing A/D dodge
movement a *positive* purpose instead of pure avoidance. That is the cheapest
win in this document: the mechanic already exists and is currently only ever
punishing.

| drop | effect |
| --- | --- |
| `FREEZE` | 3s halt on all descent |
| `NUKE` | clears live meteors, scoring each at the current multiplier |
| `REPAIR` | +1 HP, capped at run max |
| `x2` | 8s of doubled score |
| `CHAIN` | next 3 kills hit every meteor sharing that answer (temporary spread) |

Weight `REPAIR` up when HP is 1–2. Rubber-banding toward drama is standard
arcade practice and nobody has ever noticed it in a well-tuned game.

### Perfect wave

Clear a wave with zero landings: keep your combo through the breather. Otherwise
it resets at the wave boundary. This gets the press-your-luck feel without
adding a bank/push decision screen — worth revisiting if it turns out players
want the explicit gamble.

---

## 3. Expression Builder — the rules it is missing

### What is actually wrong today

1. **One target at a time** (`ExpressionScene.nextTarget`), 25s fall. Dead air.
2. **The hand is the answer.** `generateExpressionProblem` deals the canonical
   solution's chips plus exactly 2 decoys, so "use nearly everything" is always
   right, the efficiency bonus is near-constant, and there is no search.
3. **Rating is attributed to the wrong skills.** `fire()` credits
   `problem.skillIds` — the skills of the *canonical* solution — no matter what
   the player actually built. A player who solves `48` as `6 × 8` and a player
   who solves it as `50 − 2` get identical rating updates. This is a modelling
   bug, not a tuning one, and it quietly corrupts the skill table.
4. **A wrong fire costs nothing** but a counter increment.
5. **Chip reuse is undefined** in the rules even though the UI enforces
   single-use.

### Proposed rule set

**The hand is the wave's resource, not the target's.** Deal 6 chips at wave
start. A successful hit consumes the chips used and refills the hand to six. So
what changes is *which* chips you hold: spend the 25 on a target the 8 and 3
would have cleared and the 25 is gone, replaced by whatever comes.

*Shipped as refill-to-full rather than the drafted draw-2/draw-1.* Draw-2 shrank
the hand over a wave, and a shrinking shared hand cannot keep two targets
solvable at once without stranding one of them. Refilling keeps the guarantee
cheap and moves the pressure onto chip quality, which is the more interesting
axis anyway.

Add `SCRAP`: discard a chip, draw a chip, costs combo clock (Q on the chip under
the cursor).

**Every live target stays solvable.** Spending chips can put a *different*
falling target out of reach. When that happens the stranded target re-rolls to a
number the new hand can make, signposted with a RECALIBRATED flash. The promise
is that nothing falling at you is impossible; the alternative — letting a target
become unanswerable through no fault of the player — is the one outcome this
mode cannot survive.

**Generate from the hand, not the other way round.** This requires a real
solver — `core/expression/solve.ts`, pure, seeded, unit-tested. The search space
is tiny (≤4 chips, 4 operators, left-to-right with standard precedence), so an
exhaustive solve is microseconds. The generator picks a target the current hand
can definitely make; the solver also yields:

- `par` — minimum chips needed. Display it on the target like golf: `84 · PAR 3`.
- `solutionCount` — used to keep puzzles from being unique-solution needles.

**Scoring becomes legible:** base + `(par - chipsUsed)` bonus + variety bonus +
speed. Beating par is the thing to chase, and it is a genuinely mathematical
skill (spotting `7 × 12` instead of `50 + 20 + 14`).

**Two to three targets on screen.** Fire hits the lowest target whose value
matches — the same "closest match wins" rule meteor mode already uses. Restores
the ZType target-priority choice and removes the dead air.

**Misfire rule:** an expression matching no live target returns the chips (they
only burn on a hit), resets combo, and locks the composer for 1.2s. Time is the
only currency mistakes spend, per §1.

**Invalid rule:** keep the Countdown constraints — no negative intermediates, no
inexact division — but *teach* them. `FireOutcome` already carries
`'negative' | 'fractional' | 'malformed'`; the composer must show the reason on
the readout and buzz, not just refuse.

**Fix the attribution:** walk the *fired* token list and credit
`skillForOp(op, lhs, rhs)` for each step actually performed, using the running
intermediate as `lhs`. `skillForOp` already exists and needs no change; this is
a ~15 line fix in `ExpressionSession.fire` plus tests asserting that two
different solutions to the same target update different skills.

---

## 4. New mode — Factor Storm (free flight)

The asteroids-style mode, merged with the "factor storm" stub in CLAUDE.md.
These are the same game and they should not be built twice.

**Movement.** WASD flies the ship directly (velocity with drag, no rotation
inertia). Rotation-and-thrust is wrong here for one hard reason: the right hand
is on the numpad. Left hand flies, right hand answers, and the input scheme must
never require both at once. This constraint should be written into the mode's
design, not discovered during playtesting.

**The loop.** Numbered rocks drift in an arena. Type any proper factor of a
rock's number and it **splits into that factor and the quotient**: `84` → type
`4` → becomes `4` and `21` → type `3` → `21` becomes `3` and `7`. Primes cannot
split; they are destroyed by typing the number itself, and they are worth the
most. So the board *multiplies before it clears* — exactly the Asteroids
pressure curve, except the fragments are a factor tree.

**A composite can never be shot by name.** This rule is the mode. The first
implementation let any rock be destroyed by typing its own value, which paid
*more* than splitting and produced no fragments — so the best possible play was
to read the number off the screen and copy it, and no arithmetic happened
anywhere in the mode. Naming works only on a prime, where recognising primality
is itself the answer. Reaching for a composite's own value dead-ends and says
NOT PRIME — BREAK IT.

**Why this mode earns its place.** Factorisation is the highest-leverage skill
in the taxonomy: it is where times tables, exact division, and later fractions
all meet. It is also the one thing the other two modes cannot drill, because
both of them ask for a single computed answer rather than a decomposition.

**Collision.** Rocks damage the ship on contact — that is what the flying is
for. Big rocks drift slowly, fragments move fast (Asteroids' own rule, and it
means the danger rises as the board fills with primes you still have to clear).

**Scoring.** Primes pay most. A "clean split" bonus for using the largest proper
factor, so `84 → 12 × 7` beats `84 → 2 × 42` — greed points at the harder
mental step again, same trick as hot meteors.

**Adaptive hook.** Rock values are composed from the player's weak families:
someone shaky on 7s meets 7-heavy composites. `mul.table.N` and `div.exact`
already exist per family in the taxonomy, so this needs no new skill ids.

**New core module.** `core/factor/` — factorisation, split legality, scoring,
arena composition. Pure and testable, same as everything else in `core/`.

**Targeting, as shipped.** Typing applies to the *nearest* rock, ringed in gold,
and the lock is held while a buffer is being typed so drift cannot steal a shot
halfway through a number. Flying is therefore both the dodge and the selection.
A digit that no legal shot starts with clears the buffer and costs combo clock,
exactly as in meteor mode; a buffer that is still going somewhere is held, so a
rock of 63 lets you reach 21 without the 2 going off on the way.

Drops from §2 would work here, collected by flying into them — not built yet.

---

## 5. Build order

1. **`core/combo.ts` + config + HUD.** Shared by all three modes. Biggest feel
   change per line of code, and everything downstream assumes it.
2. **Meteor retune + hot meteors + drops.** Mostly config and scene work once
   combo exists; `core/drops.ts` for the weighted table.
3. **Expression rewrite.** Solver first (`core/expression/solve.ts`), then
   hand-as-resource, multi-target, par scoring. Fix the rating attribution bug
   here regardless of whether the rest lands — it is corrupting the skill table
   today.
4. **Factor Storm.** New mode, new core module, reuses everything above.

Risks worth stating: (1) the pace coupling in §2 can outrun readability at high
combo — cap it hard and playtest at tier 4 before trusting the caps; (2)
hand-as-resource in §3 can deadlock without a guaranteed-solvable generator, so
the solver is not optional; (3) Factor Storm's two-handed input scheme needs a
touch answer before it can ship to mobile.

---

## Sources

- [Z-Type — Mozilla Labs developer notes](https://blog.mozilla.org/labs/2011/02/z-type/) — keystroke feedback, target selection, decide-in-the-player's-favour
- [Z-Type (Wikipedia)](https://en.wikipedia.org/wiki/Z-Type) — endless arcade structure
- [Geometry Wars: Retro Evolved (Wikipedia)](https://en.wikipedia.org/wiki/Geometry_Wars:_Retro_Evolved) — multiplier tied to survival
- [Pac-Man Championship Edition DX (Wikipedia)](https://en.wikipedia.org/wiki/Pac-Man_Championship_Edition_DX) — ghost trains, speed as reward, adrenaline time
- [Arcade game design fundamentals — gamedesignskills.com](https://gamedesignskills.com/game-design/arcade/) — scoring for performance, mastery, risk
- [A Guide to Pressing Your Luck — I Slay the Dragon](https://islaythedragon.com/guides/a-guide-to-pressing-your-luck/) — visible timers and informed risk
- [Rhythm game scoring systems explained](https://rhythm-games.com/guides/rhythm-game-scoring-system-explained) — combo tiers and break cost
