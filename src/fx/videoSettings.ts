/**
 * The live picture settings, resolved once and read every frame.
 *
 * The pipeline runs inside `onPreRender` and has no scene, so it cannot reach
 * the save through the registry. Rather than thread a reference through every
 * camera, the resolved values live here: whoever changes a dial calls
 * `setVideoSettings`, and the shader and the camera shake both read the result.
 */
import { CONFIG, type CrtConfig } from '../core/config';
import {
  defaultVideoSettings,
  scaleCrt,
  type VideoSettings,
} from '../core/settings/video';

let video: VideoSettings = defaultVideoSettings();
let crt: CrtConfig = scaleCrt(CONFIG.crt, video);

/** Apply the player's dials. Takes effect on the next rendered frame. */
export function setVideoSettings(next: VideoSettings): void {
  video = next;
  crt = scaleCrt(CONFIG.crt, next);
}

/** Shader values for this frame, art direction times the player's dials. */
export function activeCrt(): CrtConfig {
  return crt;
}

/** Multiplier for every camera shake in the game. Zero means no shake at all. */
export function shakeScale(): number {
  return video.shake;
}
