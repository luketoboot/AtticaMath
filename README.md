# Numeracy

Browser arcade arithmetic. Neon on black, CRT glass, a synthwave operator in
your ear — and every number on screen is a live problem. Type the answer and
the gun fires itself: there is no enter key, the input buffer is watched
continuously and a matching answer fires the moment it lands.

Difficulty is fully adaptive. Every atomic skill — each times-table family,
bridging ten, borrowing, divisibility by seven — carries its own rating, and
waves are composed from yours: mostly what you're fluent at, a slice of your
frontier, a taste of what you've been avoiding. The game never asks your age
and never shows a grade level. The first few waves quietly find you.

## Modes

- **Meteor Defense** — problems fall, answers shoot them down. The flagship.
- **Expression Builder** — a target falls; compose an expression from a hand
  of numbers and operators. Countdown as an action game.
- **Factor Storm** — asteroids in free flight; type a factor to split them.
  A prime dies by its own name.
- **Collapse** — two-state ship, you phase through your own colour. Percents
  and fractions as ammunition.
- **Polarity** — Ikaruga with divisors. The number you wear is the key you
  fire with; the colour that lets you attack is the colour that leaves you
  exposed.
- **Kakooma** — in each cell, one number is the sum of two others. Find it.
- **Cages** — a Latin square carved into arithmetic cages, solver-proven to a
  unique solution. The one board where the smallest number wins.
- **Daily Challenge** — one seeded Meteor Defense run per UTC day, identical
  for everyone, one shared board.

Press **H** in any mode for its briefing, over a paused game.

Desktop and web, played on a keyboard — one hand on WASD, one on the numpad.
There is no mobile version and there won't be; the input model is the game.

## Running it

```
npm install
npm run dev      # Vite dev server
npm run build    # typecheck + production bundle (dist/)
npm run test     # Vitest — the simulation is pure TS and fully unit tested
npm run audio    # reconcile the sample table against public/sfx and public/music
```

No backend and no accounts. Saves live in localStorage. The daily board is
the one server-backed feature: copy `.env.example` to `.env` with Supabase
credentials to share a board (schema in `supabase/migrations/`), or leave it
unset and the daily falls back to a device-local board and says so on screen.
Either way the game is complete.

## Layout

Game logic and rendering are strictly separated: `src/core/` is pure
TypeScript — problem generation, the rating model, wave composition, every
mode's session — with no Phaser imports and full test coverage. `src/game/`,
`src/ui/` and `src/fx/` are the Phaser layer that consumes it. Design
rationale lives in `CLAUDE.md`; visual regressions are caught by a
deterministic screenshot harness (`npm run shot`).
