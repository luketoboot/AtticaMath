import type Phaser from 'phaser';
import { AUDIO_REGISTRY_KEY, type AudioManager } from './AudioManager';

export function getAudio(scene: Phaser.Scene): AudioManager | undefined {
  return scene.registry.get(AUDIO_REGISTRY_KEY) as AudioManager | undefined;
}
