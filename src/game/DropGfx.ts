/**
 * How a pickup looks and sounds, in one place.
 *
 * Five modes hand out the same six effects, and a player should not have to
 * re-learn what a yellow pod means when they change screen. Colour, glyph and
 * the noise it makes on collection are properties of the effect, not of the
 * mode that happened to drop it.
 */
import Phaser from 'phaser';
import { getAudio } from '../audio/getAudio';
import { DROP_LABEL, type DropKind } from '../core/drops';
import { CSS, FONT, PALETTE } from '../fx/palette';

/** Each effect owns a colour everywhere it appears. */
export const DROP_COLOR: Readonly<Record<DropKind, number>> = {
  freeze: PALETTE.cyan,
  nuke: PALETTE.red,
  repair: PALETTE.magentaHot,
  double: PALETTE.yellow,
  chain: PALETTE.purple,
  shield: PALETTE.white,
};

export const DROP_CSS: Readonly<Record<DropKind, string>> = {
  freeze: CSS.cyan,
  nuke: CSS.red,
  repair: CSS.magentaHot,
  double: CSS.yellow,
  chain: CSS.purple,
  shield: CSS.white,
};

/**
 * A floating pod. The caller owns the container and moves it — the flight modes
 * drift theirs, Meteor Defense drops it straight down.
 */
export function pickupPod(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: DropKind,
  radius = 22,
): Phaser.GameObjects.Container {
  const color = DROP_COLOR[kind];
  const ring = scene.add.circle(0, 0, radius).setStrokeStyle(3, color, 1);
  const core = scene.add.circle(0, 0, radius * 0.55, color, 0.18);
  const label = scene.add
    .text(0, 0, DROP_LABEL[kind], {
      fontFamily: FONT,
      fontSize: `${Math.round(radius * 0.68)}px`,
      fontStyle: 'bold',
      color: DROP_CSS[kind],
    })
    .setOrigin(0.5);

  const container = scene.add.container(x, y, [core, ring, label]).setDepth(6);
  scene.tweens.add({ targets: ring, scale: 1.22, duration: 500, yoyo: true, repeat: -1 });
  // Announce itself on arrival: a pickup that fades in is a pickup you miss.
  getAudio(scene)?.play('shield', { pitch: 1.3 });
  return container;
}

/** Mark an entity as carrying something, without saying what. */
export function carrierRing(
  scene: Phaser.Scene,
  radius: number,
): Phaser.GameObjects.Arc {
  const ring = scene.add.circle(0, 0, radius).setStrokeStyle(2, PALETTE.yellow, 0.9);
  scene.tweens.add({
    targets: ring,
    scale: 1.18,
    alpha: 0.45,
    duration: 620,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return ring;
}

/** The noise and the screen flash for collecting one. Kind-specific on purpose. */
export function announceDrop(scene: Phaser.Scene, kind: DropKind): void {
  const audio = getAudio(scene);
  switch (kind) {
    case 'nuke':
      audio?.play('bossDown');
      break;
    case 'repair':
      audio?.play('shield');
      scene.cameras.main.flash(200, 255, 90, 209);
      break;
    case 'freeze':
      audio?.play('slowfield');
      scene.cameras.main.flash(160, 0, 220, 255);
      break;
    case 'shield':
      audio?.play('shield');
      scene.cameras.main.flash(220, 255, 255, 255);
      break;
    default:
      audio?.play('purchase');
      break;
  }
}

/** "FREEZE 1.8 · x2 5.2" — the running-effects readout, shared by every HUD. */
export function effectsLine(state: {
  freezeLeft: number;
  doubleLeft: number;
  chainLeft: number;
  shieldLeft: number;
}): string {
  const parts: string[] = [];
  if (state.freezeLeft > 0) parts.push(`FREEZE ${state.freezeLeft.toFixed(1)}`);
  if (state.doubleLeft > 0) parts.push(`x2 ${state.doubleLeft.toFixed(1)}`);
  if (state.chainLeft > 0) parts.push(`CHAIN ${state.chainLeft}`);
  if (state.shieldLeft > 0) parts.push(`SHIELD ${state.shieldLeft.toFixed(1)}`);
  return parts.join('  ·  ');
}
