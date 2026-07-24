import type Phaser from 'phaser';
import { SAVE_REGISTRY_KEY, type SaveManager } from '../game/storage';
import { CrtPipeline } from './CrtPipeline';

/** Apply (or skip) the CRT post pipeline on a scene's main camera per settings. */
export function applyCrt(scene: Phaser.Scene): void {
  const saves = scene.registry.get(SAVE_REGISTRY_KEY) as SaveManager | undefined;
  const enabled = saves?.save.settings.crtEnabled ?? true;
  scene.cameras.main.resetPostPipeline();
  if (enabled && scene.game.renderer.type === 2 /* WEBGL */) {
    scene.cameras.main.setPostPipeline(CrtPipeline.KEY);
  }
}
