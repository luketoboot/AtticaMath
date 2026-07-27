-- Daily challenge leaderboard.
--
-- One table, read by everyone and appended to by anyone, with no accounts. The
-- game has no auth and is not getting any for this feature, so every rule that
-- can be expressed as a constraint is expressed as a constraint: the anon role
-- can insert exactly one row per device per day, for today only, and can never
-- modify or delete anything once it lands.

create table if not exists public.daily_scores (
  id       bigint generated always as identity primary key,
  -- The UTC date the run belongs to. The client sends this, and the insert
  -- policy below refuses anything that is not today, so a client cannot
  -- backfill a quiet day or post ahead into tomorrow's board.
  date     date        not null,
  -- A per-device id from localStorage. Not an identity and not anti-cheat:
  -- it exists so one browser cannot fill the board with the same run, and so
  -- a retried upload is a no-op rather than a duplicate row.
  player   uuid        not null,
  initials text        not null,
  score    integer     not null,
  wave     integer     not null,
  badge    text,
  at       timestamptz not null default now(),

  -- The arcade alphabet, exactly three characters. Anything else is a client
  -- that has drifted from core/leaderboard and should be rejected, not stored.
  constraint daily_scores_initials_shape check (initials ~ '^[A-Z0-9 ]{3}$'),
  -- Loose sanity bounds. These are not a cheat check — a client-side game
  -- cannot have one — they only keep a broken or bored client from writing a
  -- number that would wreck the board's scale for everybody reading it.
  constraint daily_scores_score_range check (score > 0 and score <= 100000000),
  constraint daily_scores_wave_range check (wave >= 0 and wave <= 10000),
  constraint daily_scores_badge_len check (badge is null or length(badge) <= 64),
  -- One row per device per day: the same one-attempt rule the save enforces,
  -- restated where it can actually be relied on.
  constraint daily_scores_one_per_player unique (date, player)
);

-- The only query the game runs: today's board, best first.
create index if not exists daily_scores_date_score_idx
  on public.daily_scores (date, score desc, at asc);

alter table public.daily_scores enable row level security;

-- Depending on the project's Data API settings a SQL-created table is not
-- automatically reachable by the anon role, so the grants are explicit. RLS is
-- on above, which is what actually decides who sees and writes which rows.
grant usage on schema public to anon, authenticated;
grant select, insert on public.daily_scores to anon, authenticated;

drop policy if exists "daily scores are public" on public.daily_scores;
create policy "daily scores are public"
  on public.daily_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone may post today's score" on public.daily_scores;
create policy "anyone may post today's score"
  on public.daily_scores
  for insert
  to anon, authenticated
  with check (date = (now() at time zone 'utc')::date);

-- No update or delete policy, deliberately. With RLS on, an absent policy is a
-- denial, so a posted score is immutable — which is the only property that
-- makes yesterday's board worth anything.
