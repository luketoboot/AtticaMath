# Music

Owner-supplied music tracks. Files here are served at the site root, so
`public/music/Last_Exit_Before_Dawn.mp3` is fetched by the game as
`music/Last_Exit_Before_Dawn.mp3`.

`AudioManager` (src/audio/AudioManager.ts) maps three named tracks in
`MUSIC_TRACKS`:

| Track  | File                        | Played by                                     |
| ------ | --------------------------- | --------------------------------------------- |
| `menu` | Last_Exit_Before_Dawn.mp3   | Menu, ModeSelect, Shop, Settings, BrainScan, Debrief |
| `game` | Midnight_Interceptor.mp3    | GameScene (Meteor Defense), ExpressionScene    |
| `boss` | Red_Room_Standoff.mp3       | BossScene                                      |

Scenes call `getAudio(this)?.playMusic('<track>')` in `create()`. Switching
tracks crossfades over `CROSSFADE_MS`; re-requesting the playing track is a
no-op, and missing files fail silently so the game runs with this directory
empty.

Renaming a file here means updating `MUSIC_TRACKS`. Prefer seamless loops
exported as compressed mp3/ogg — these files are streamed on demand, not part
of the JS bundle, but they still cost the player bandwidth on first play.
