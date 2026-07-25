import type Phaser from 'phaser';
import { CONFIG } from '../core/config';
import { CrtPipeline } from './CrtPipeline';

/**
 * Shared impact feel: camera shake, CRT glow pulse, hit-stop, shockwave rings.
 * Scenes call these instead of poking the camera directly so the whole game
 * shakes to one set of tunables.
 */

/** Active hit-stop scale per scene; absent means normal speed. */
const freezes = new WeakMap<Phaser.Scene, number>();

/** Spike the CRT bloom. No-op when the pipeline is off (accessibility setting). */
export function glowPulse(scene: Phaser.Scene, amount: number): void {
  const pipe = scene.cameras.main.getPostPipeline(CrtPipeline.KEY);
  for (const p of Array.isArray(pipe) ? pipe : [pipe]) {
    if (p instanceof CrtPipeline) p.pulse(amount);
  }
}

/**
 * Brief near-freeze that sells an impact. Scenes that move things in update()
 * must scale their delta by timeScale(scene) for this to read.
 */
export function hitStop(scene: Phaser.Scene, durationMs: number, scale: number): void {
  if (freezes.has(scene)) return; // already frozen; don't stack scales
  freezes.set(scene, scale);
  scene.tweens.timeScale = scale;
  scene.time.timeScale = scale;

  // The clock is itself slowed, so shorten the delay to land at real durationMs.
  scene.time.delayedCall(durationMs * scale, () => {
    freezes.delete(scene);
    scene.tweens.timeScale = 1;
    scene.time.timeScale = 1;
  });
}

/** Current time scale for a scene: 1 unless a hit-stop is running. */
export function timeScale(scene: Phaser.Scene): number {
  return freezes.get(scene) ?? 1;
}

/** Drop any freeze immediately — call on scene shutdown or run end. */
export function clearHitStop(scene: Phaser.Scene): void {
  freezes.delete(scene);
  scene.tweens.timeScale = 1;
  scene.time.timeScale = 1;
}

export interface ImpactOptions {
  shakeMs: number;
  shakeIntensity: number;
  glow: number;
  /** Omit to skip the freeze entirely. */
  hitStopMs?: number;
}

/** Shake + glow (+ optional hit-stop) in one call. */
export function impact(scene: Phaser.Scene, opts: ImpactOptions): void {
  scene.cameras.main.shake(opts.shakeMs, opts.shakeIntensity);
  glowPulse(scene, opts.glow);
  if (opts.hitStopMs !== undefined) {
    hitStop(scene, opts.hitStopMs, CONFIG.juice.hitStopScale);
  }
}

/**
 * Snap the camera in and ease back out. Reads as the world flinching rather
 * than the camera moving, so it stacks with shake instead of fighting it.
 */
export function cameraPunch(scene: Phaser.Scene, amount: number, durationMs: number): void {
  const cam = scene.cameras.main;
  const base = 1;
  cam.zoomTo(base + amount, durationMs * 0.28, 'Cubic.easeOut');
  scene.time.delayedCall(durationMs * 0.28, () => {
    cam.zoomTo(base, durationMs * 0.72, 'Cubic.easeOut');
  });
}

/** Expanding neon ring — reads as a concussion wave behind the particles. */
export function shockwave(scene: Phaser.Scene, x: number, y: number, tint: number): void {
  const { shockwaveRadius, shockwaveMs } = CONFIG.juice;
  const ring = scene.add.circle(x, y, 8);
  ring.setFillStyle();
  ring.setStrokeStyle(4, tint, 1);
  scene.tweens.add({
    targets: ring,
    radius: shockwaveRadius,
    alpha: 0,
    duration: shockwaveMs,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** SFX pitch multiplier for the current streak — kills climb in pitch. */
export function streakPitch(streak: number): number {
  const { streakPitchStep, maxStreakPitch } = CONFIG.juice;
  return Math.min(maxStreakPitch, 1 + streak * streakPitchStep);
}
