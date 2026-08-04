/**
 * Entry animation for menu screens: an element is built at its final place,
 * hidden on the spot, then fades (and optionally rises) in after `delay`.
 *
 * It runs off a proxy tween because focus animations call
 * killTweensOf(container), and a reveal they could kill would strand a card
 * half-transparent. The tween must also run to completion to leave the
 * element usable — the shot harness relies on this: it fast-forwards every
 * create-time tween before freezing, so a captured screen is the settled
 * layout rather than frame zero of its deal-in.
 */
import type Phaser from 'phaser';

interface Revealable {
  y: number;
  setAlpha(alpha: number): unknown;
}

export function revealIn(
  scene: Phaser.Scene,
  obj: Revealable,
  delay: number,
  rise = 0,
): void {
  const baseY = obj.y;
  const p = { t: 0 };
  obj.setAlpha(0);
  if (rise > 0) obj.y = baseY + rise;
  scene.tweens.add({
    targets: p,
    t: 1,
    delay,
    duration: 240,
    ease: 'Quad.easeOut',
    onUpdate: () => {
      obj.setAlpha(p.t);
      if (rise > 0) obj.y = baseY + rise * (1 - p.t);
    },
    onComplete: () => {
      obj.setAlpha(1);
      if (rise > 0) obj.y = baseY;
    },
  });
}
