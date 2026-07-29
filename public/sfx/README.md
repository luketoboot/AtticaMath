# SFX samples

Optional. Every effect here already has a synthesized version in
`AudioManager`; a file dropped into this folder **overrides** it. Missing files
fail silently, so the game runs fine with this directory empty or half-filled.
Add one file, hear one improvement.

**After dropping files in, run `npm run audio`.** A sample the game never asks
for is the one failure this folder can hide: missing files fall back to
synthesis silently, so a misspelled filename sounds exactly like a file you
never added. That check tells the two apart, and lists which effects are still
down to a single take.

Files are streamed from the site root (`public/sfx/gun_fraction_a.mp3` is
fetched as `sfx/gun_fraction_a.mp3`) and are **not** part of the JS bundle, so
they don't count against the 2MB budget. Keep each one small — these are short
one-shots, 10–40KB each is normal. Twenty files is about 300KB total.

`.mp3` is what the table expects. Any format the browser can decode works if
you also update the paths in `SAMPLES` (src/audio/AudioManager.ts).

## Why layers

A single recording of a gunshot sounds thin. Real weapon audio is stacked: a
**mechanical** transient (the action), a **body** (the actual report), and a
**tail** (the space it happened in). The loader plays all three as one sound
with a shared stereo position. You can supply only the body and it will still
sound better than synthesis — the other layers are upside.

Some effects accept **alternate takes** — extra files with the same name but a
different letter suffix. One is picked at random per trigger, which is the
single biggest defence against the machine-gun effect. **Each suffix is its own
separate file**; `_a`, `_b` and `_c` are three recordings, not one file named
"a/b/c". Only `_a` is required — the others are optional upside and are ignored
until they exist.

## What to drop in

Filenames are exact. Anything marked *(optional)* can be added later.

| File | Layer | What to look for |
| --- | --- | --- |
| `gun_fraction_mech.mp3` | mechanical | Short, dry metallic click. Trigger/action noise, no tone. ~50ms |
| `gun_fraction_a.mp3` | body | The shot. Tight, bright, cutting — energy-weapon zap or a snappy pistol crack. ~150ms |
| `gun_fraction_b.mp3` | body *(optional)* | A second take of the above |
| `gun_fraction_c.mp3` | body *(optional)* | A third take of the above |
| `gun_fraction_tail.mp3` | tail | Thin decay/whine after the shot. Quiet. ~400ms |
| `gun_percent_mech.mp3` | mechanical | Same idea, slightly heavier/lower than the fraction gun |
| `gun_percent_a.mp3` | body | Rounder, lower, heavier than the fraction gun — the two must be tellable apart by ear |
| `gun_percent_b.mp3` | body *(optional)* | A second take |
| `gun_percent_c.mp3` | body *(optional)* | A third take |
| `gun_percent_tail.mp3` | tail | Low decay/rumble. Quiet. ~500ms |
| `reload_mag.mp3` | swap 1 | Magazine release. Dry plastic/metal snap. **Under 40ms** |
| `reload_rack.mp3` | swap 2 | Slide or charging handle drawn back. **Under 60ms** |
| `reload_bolt.mp3` | swap 3 | Bolt slamming home. The loudest of the three, with real low end. **Under 90ms** |
| `bolt_hit_a.mp3` | — | Projectile striking rock. Short hard crack |
| `bolt_hit_b.mp3` | — *(optional)* | A second take |
| `implode_charge.mp3` | 1 | Rising suck/whoosh, ~300ms. Should feel like intake |
| `implode_boom.mp3` | 2 | The detonation. Deep, big, with sub |
| `implode_debris.mp3` | 3 | Falling rubble/sparkle tail, ~600ms |
| `explosion_a.mp3` | — | General kill explosion, used by other modes too |
| `explosion_b.mp3` | — *(optional)* | A second take |
| `player_hit.mp3` | — | Taking damage. Blunt, unpleasant, short |
| `thruster_loop.mp3` | **loop** | Engine burn, held while thrust is on. See below |

### The thruster loop is special

It plays continuously rather than once, so it must **loop seamlessly**: no fade
in, no fade out, no distinct events, constant level throughout. 2–4 seconds is
plenty. Trim it from the steady middle of a generated file rather than stripping
leading silence — see `PROMPTS.md`.

Until the file exists, thrust uses a **synthesized** loop (filtered noise over a
detuned low rumble, crossfaded at the seam), so the ship is never silent. Drop
the file in and it takes over.

Reverse thrust reuses this same loop at 0.82× rate and lower gain. It does not
need its own file.

## Generated files need trimming first

Text-to-audio generators pad their output to a fixed minimum — a 1-second file
whose actual sound starts half a second in. **Leading silence reads as input
lag**, and on the reload it makes the gun swap feel broken.

Strip it before dropping a file in here:

```sh
ffmpeg -i raw.mp3 \
  -af "silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:detection=peak,afade=t=out:st=0.37:d=0.03" \
  -t 0.40 -c:a libmp3lame -b:a 128k -ar 44100 out.mp3
```

Set `-t` to the length you want and `st` to 30ms less. If the result comes out
near-silent, the file's noise floor was above the gate — raise the threshold
(`-40dB`) and try again. Check with:

```sh
ffprobe -v error -show_entries format=duration -of csv=p=0 out.mp3
ffmpeg -i out.mp3 -af volumedetect -f null - 2>&1 | grep max_volume
```

A healthy one-shot peaks near 0 dB; anything under about −30 dB means the
transient got cut off.

**The reload three must stay short.** They're scheduled at 0ms / 28ms / 75ms to
land inside `CONFIG.collapse.swapLockoutSeconds` (currently 0.17s). If the bolt
sample runs long, the swap will *sound* slower than it is. Trim tightly at the
head — leading silence in a sample reads as input lag.

## Where to get them, license-clean

- **Sonniss GDC Bundle** — released free every year, tens of GB of pro library
  content, royalty-free for commercial use. The best source by a wide margin.
  Search "Sonniss GDC game audio bundle".
- **Freesound.org** — filter licence to **CC0** to avoid attribution
  requirements. Good for individual mechanical clicks and racks.
- **Kenney.nl** — CC0 game asset packs. Simpler and more retro; a decent match
  for this game's aesthetic if the realistic libraries feel too grounded.

Check the licence on anything you take. CC0 needs no attribution; CC-BY does,
and that obligation would follow the game.

## Tuning

Per-layer `gain`, `send` (reverb), `delay`, and `pitchVary` all live in the
`SAMPLES` table in `src/audio/AudioManager.ts`. Raise `pitchVary` if repeated
fire still sounds mechanical; raise `send` on tails to push a sound further
back in the space.
