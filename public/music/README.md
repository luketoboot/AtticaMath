# Music

Owner-supplied music tracks. Files here are served at the site root, so
`public/music/Last_Exit_Before_Dawn.mp3` is fetched by the game as
`music/Last_Exit_Before_Dawn.mp3`.

`AudioManager` (src/audio/AudioManager.ts) maps five named tracks in
`MUSIC_TRACKS`:

| Track     | File                      | Played by                                                       |
| --------- | ------------------------- | --------------------------------------------------------------- |
| `menu`    | Last_Exit_Before_Dawn.mp3 | Menu, ModeSelect, Shop, Settings, Controls, BrainScan, Leaderboard |
| `game`    | Midnight_Interceptor.mp3  | GameScene (Meteor Defense), ExpressionScene                       |
| `boss`    | Red_Room_Standoff.mp3     | BossScene                                                         |
| `drift`   | Black_Glass_Horizon.mp3   | FactorScene (Factor Storm), CollapseScene                         |
| `pulse`   | Chain_Reaction.mp3        | CollapseScene                                                     |
| `debrief` | Rain_on_the_Pane.mp3      | DebriefScene                                                      |

The free-flight modes take `drift` rather than `game`: meteors fall *at* you and
want a driving track, while Factor Storm and Collapse are weightless and 360°.
`debrief` exists so dying drops you into a comedown instead of straight back
into the menu loop.

Scenes call `getAudio(this)?.playMusic('<track>')` in `create()`. Switching
tracks crossfades over `CROSSFADE_MS`; re-requesting the playing track is a
no-op, and missing files fail silently so the game runs with this directory
empty.

## Rotations

`playMusic` also takes an array — `playMusic(['pulse', 'drift'])` — and the
tracks hand off to each other at the end of each one, crossfading over the same
`CROSSFADE_MS`, then wrapping. Collapse uses this: it has no wave structure to
end a run, so sessions run long enough that one loop wears through. Pulse
leads, so a run opens on the beat.

A rotation only loops the file when it is a rotation of one, so **tracks meant
for rotation want a real ending, not a seamless loop point**. Re-requesting the
same rotation is a no-op, so this is still safe to call in `create()`. If a file
in a rotation is missing, that slot plays silence for its turn — the rotation
does not skip it.

Renaming a file here means updating `MUSIC_TRACKS`. Prefer seamless loops
exported as compressed mp3/ogg — these files are streamed on demand, not part
of the JS bundle, but they still cost the player bandwidth on first play.
