/**
 * Per-effect video intensity, as multipliers over the configured look.
 *
 * The CRT config is the art direction; these are the player's dial on top of
 * it. Storing multipliers rather than raw shader values means the tuned look
 * can keep moving in config without every save file freezing an old picture —
 * 1.0 always means "however the game currently ships".
 *
 * Motion knobs (shake) live here too. Anyone who needs the scanlines off is
 * usually the same person who needs the camera to stop lurching, and making
 * them hunt two screens for that would be careless.
 */
import type { CrtConfig } from '../config';

export interface VideoSettings {
  /** Horizontal scanline depth. */
  scanlines: number;
  /** Phosphor bloom around bright pixels. */
  bloom: number;
  /** RGB aperture mask — the fine vertical stripe. */
  mask: number;
  /** Barrel distortion of the glass. */
  curvature: number;
  /** Chromatic split toward the edges. */
  aberration: number;
  /** Reflected room light on the glass. */
  glare: number;
  /** Corner darkening. */
  vignette: number;
  /** Camera shake on impacts. */
  shake: number;
}

export type VideoSettingId = keyof VideoSettings;

export const VIDEO_MIN = 0;
export const VIDEO_MAX = 2;
export const VIDEO_STEP = 0.1;

export interface VideoKnob {
  id: VideoSettingId;
  label: string;
  /** One line on what moving it does, in plain terms. */
  hint: string;
}

/** Display order on the video screen. Loudest effects first. */
export const VIDEO_KNOBS: readonly VideoKnob[] = [
  { id: 'scanlines', label: 'SCANLINES', hint: 'HORIZONTAL LINE DEPTH' },
  { id: 'bloom', label: 'BLOOM', hint: 'PHOSPHOR GLOW AROUND BRIGHT PIXELS' },
  { id: 'mask', label: 'APERTURE MASK', hint: 'RGB STRIPE OF THE TUBE' },
  { id: 'curvature', label: 'CURVATURE', hint: 'BARREL BEND OF THE GLASS' },
  { id: 'aberration', label: 'COLOUR SPLIT', hint: 'CHROMATIC FRINGE AT THE EDGES' },
  { id: 'glare', label: 'GLARE', hint: 'REFLECTED ROOM LIGHT' },
  { id: 'vignette', label: 'VIGNETTE', hint: 'CORNER DARKENING' },
  { id: 'shake', label: 'SCREEN SHAKE', hint: 'CAMERA KICK ON IMPACTS' },
];

/**
 * Barrel distortion has a hard ceiling regardless of the dial: past this the
 * corners push the HUD, which sits 24px from the edge, out under the bezel.
 */
export const MAX_CURVATURE = 0.13;

export function defaultVideoSettings(): VideoSettings {
  return {
    scanlines: 1,
    bloom: 1,
    mask: 1,
    curvature: 1,
    aberration: 1,
    glare: 1,
    vignette: 1,
    shake: 1,
  };
}

function clamp(value: number): number {
  return Math.min(VIDEO_MAX, Math.max(VIDEO_MIN, value));
}

/**
 * Read whatever is in a save into a usable settings object. Unknown shapes,
 * missing knobs and out-of-range numbers all fall back rather than throw —
 * a corrupt display setting must never cost someone their save.
 */
export function sanitizeVideoSettings(raw: unknown): VideoSettings {
  const out = defaultVideoSettings();
  if (typeof raw !== 'object' || raw === null) return out;
  const source = raw as Record<string, unknown>;
  for (const knob of VIDEO_KNOBS) {
    const value = source[knob.id];
    if (typeof value === 'number' && Number.isFinite(value)) out[knob.id] = clamp(value);
  }
  return out;
}

/** The shader values to actually render with. */
export function scaleCrt(base: CrtConfig, video: VideoSettings): CrtConfig {
  return {
    glowBase: base.glowBase * video.bloom,
    // Threshold rides with bloom rather than being its own dial: lowering it as
    // bloom climbs is what lets the extra glow reach the mid-tones instead of
    // only the whites, so the knob reads as *more glow* and not as *whites got
    // slightly brighter*. Floored so a dial at zero cannot divide by it.
    bloomThreshold: base.bloomThreshold / Math.max(0.5, video.bloom),
    curvature: Math.min(base.curvature * video.curvature, MAX_CURVATURE),
    cornerRadius: base.cornerRadius,
    maskStrength: base.maskStrength * video.mask,
    scanlineDepth: base.scanlineDepth * video.scanlines,
    glareStrength: base.glareStrength * video.glare,
    aberration: base.aberration * video.aberration,
    vignette: base.vignette * video.vignette,
  };
}

/** Whether every knob is still where it shipped. */
export function isDefaultVideo(settings: VideoSettings): boolean {
  const base = defaultVideoSettings();
  return VIDEO_KNOBS.every((knob) => settings[knob.id] === base[knob.id]);
}
