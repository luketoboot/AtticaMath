# ElevenLabs prompts for these samples

Generation prompts for every file in `README.md`. Generate, trim, rename to the
exact filename in the table, drop it in this folder.

## Rules that apply to every prompt

**Always ask for "dry, close-mic'd, no reverb."** `AudioManager` runs its own
convolution reverb on a send bus and sets the wet amount per layer. A sample
with baked-in room sound gets reverb applied twice and turns to mud — this is
the single most important instruction in every prompt below.

**Set duration explicitly short.** These are one-shots. If the generator gives
you a minimum longer than you want, generate long and trim.

**Trim silence off the head.** Leading silence reads as input lag. The three
reload samples are scheduled at 0ms / 28ms / 75ms and a late transient will
make the gun swap feel slower than it is.

**Push prompt influence high** (0.7–1.0). These are precise technical sounds,
not moods; you want literal obedience, not interpretation.

**For `_a` / `_b` / `_c` variants, run the same prompt several times** and keep
the takes that differ most from each other. That variation is what stops
sustained fire sounding like a machine gun.

**Aesthetic:** neon synthwave, Hotline Miami. Energy weapons with real
mechanical actions — synthetic discharge, physical hardware.

---

## Fraction gun — tight, bright, cutting

**`gun_fraction_mech.mp3`** · ~50ms
> Dry mechanical trigger click, small metal switch snapping shut, tight and
> percussive, close-mic'd, completely dry, no reverb, no tail, single isolated
> click

**`gun_fraction_a.mp3` / `_b` / `_c`** · ~150ms
> Short sharp sci-fi energy pistol shot, tight bright electric zap with a hard
> cracking transient, high-pitched laser bolt firing, aggressive and snappy,
> close and dry, no reverb, no echo, single shot

**`gun_fraction_tail.mp3`** · ~400ms, quiet
> Thin high-pitched electrical whine decaying away to silence, faint energy
> discharge ringing off, airy and quiet, dry, no reverb

## Percent gun — rounder, lower, heavier

**`gun_percent_mech.mp3`** · ~50ms
> Heavy mechanical clunk, thick metal lever seating, low dry percussive click,
> close-mic'd, completely dry, no reverb, single isolated hit

**`gun_percent_a.mp3` / `_b` / `_c`** · ~180ms
> Deep heavy sci-fi plasma cannon shot, thick low energy blast with punchy sub
> bass, dark and round, powerful single discharge, close and dry, no reverb, no
> echo

**`gun_percent_tail.mp3`** · ~500ms, quiet
> Low rumbling energy decay, dark synthetic hum falling away to silence, deep
> and quiet, dry, no reverb

## Gun swap — keep these SHORT

**`reload_mag.mp3`** · under 40ms
> Magazine release catch, sharp plastic and metal snap, very short and dry,
> close-mic'd, no reverb, isolated single click

**`reload_rack.mp3`** · under 60ms
> Pistol slide racking back fast, brief metallic scrape into a snap, mechanical
> and dry, close-mic'd, no reverb

**`reload_bolt.mp3`** · under 90ms — the loudest of the three
> Heavy bolt slamming home, solid metallic clack with a deep low thud
> underneath, weighty and final, close-mic'd, dry, no reverb, single hit

## Impacts

**`bolt_hit_a.mp3` / `_b`** · ~120ms
> Sharp energy bolt striking stone, hard cracking impact with a spray of small
> debris, short and punchy, dry, no reverb

**`player_hit.mp3`** · ~200ms
> Blunt heavy damage impact, dull thud with a short distorted crunch, ugly and
> percussive, dry, short, no reverb

**`explosion_a.mp3` / `_b`** · ~600ms
> Punchy mid-sized explosion, sharp crack over a low booming body, arcade game
> destruction, tight and dry, no long reverb tail

## The collapse — three stages

**`implode_charge.mp3`** · ~300ms
> Rising sci-fi energy suction, air rushing inward and accelerating, pitch
> sweeping upward, building tension that cuts off abruptly at its peak, dry, no
> reverb

**`implode_boom.mp3`** · ~800ms
> Massive deep explosion with an enormous sub bass drop, powerful cinematic
> detonation, huge low-end impact, punchy and dark

**`implode_debris.mp3`** · ~600ms, quiet
> Falling rubble and glittering debris settling, small rocks scattering with
> shimmering metallic particles, sparse and quiet, dry

---

## Thruster — a loop, not a one-shot

**`thruster_loop.mp3`** · 2–4s, must loop seamlessly

This one is different from everything above. It plays continuously while thrust
is held, so it has to survive being repeated forever. Two extra requirements:

- **No fade in and no fade out.** A fade bakes in a volume dip that becomes an
  audible pulse every loop. The engine fades it in and out itself.
- **No distinct events.** Anything with a recognisable start — a pop, a swell,
  a burst — becomes a rhythmic tick once it repeats. You want texture, not
  gesture.

If ElevenLabs offers a *loop* or *seamless* toggle, turn it on.

> Steady continuous rocket engine thrust, deep low rumble underneath a layer of
> smooth white-noise hiss, completely constant and unchanging in level and
> tone, no swells, no bursts, no events, even and sustained throughout, dry
> close recording, no reverb, no fade in, no fade out, seamless loop

**Trim differently from the one-shots.** Don't strip leading silence — cut a
clean section out of the steady middle instead, where the texture is already
established:

```sh
ffmpeg -i raw.mp3 -ss 0.5 -t 3.0 -c:a libmp3lame -b:a 128k -ar 44100 thruster_loop.mp3
```

Then listen to it looped. If you hear a click or a pulse at the seam, move
`-ss` and try another section.

Reverse thrust does **not** need its own file — the engine re-pitches this same
loop down to 0.82× at lower volume, which reads as one ship at a lower
throttle rather than two different engines.

---

## After generating

Export as `.mp3`, keep each file small (10–40KB is normal for these lengths),
name it exactly as above, and drop it here. `AudioManager` picks it up on the
next load and that effect stops using its synthesized version. Per-layer gain,
reverb send, delay, and pitch variation are tunable in the `SAMPLES` table in
`src/audio/AudioManager.ts`.
