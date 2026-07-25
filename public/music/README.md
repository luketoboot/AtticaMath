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
| `debrief` | Rain_on_the_Pane.mp3      | DebriefScene                                                      |

The free-flight modes take `drift` rather than `game`: meteors fall *at* you and
want a driving track, while Factor Storm and Collapse are weightless and 360°.
`debrief` exists so dying drops you into a comedown instead of straight back
into the menu loop.

Scenes call `getAudio(this)?.playMusic('<track>')` in `create()`. Switching
tracks crossfades over `CROSSFADE_MS`; re-requesting the playing track is a
no-op, and missing files fail silently so the game runs with this directory
empty.

Renaming a file here means updating `MUSIC_TRACKS`. Prefer seamless loops
exported as compressed mp3/ogg — these files are streamed on demand, not part
of the JS bundle, but they still cost the player bandwidth on first play.
