import Phaser from 'phaser';
import { AudioManager, AUDIO_REGISTRY_KEY } from '../../audio/AudioManager';
import { CrtPipeline } from '../../fx/CrtPipeline';
import { PALETTE } from '../../fx/palette';
import { SaveManager, SAVE_REGISTRY_KEY } from '../storage';

/** Generates all textures procedurally (no asset downloads) and boots the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const saves = new SaveManager();
    this.registry.set(SAVE_REGISTRY_KEY, saves);
    this.registry.set(
      AUDIO_REGISTRY_KEY,
      new AudioManager(saves.save.settings.sfxVolume, saves.save.settings.musicVolume),
    );

    if (this.game.renderer.type === Phaser.WEBGL) {
      const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      renderer.pipelines.addPostPipeline(CrtPipeline.KEY, CrtPipeline);
    }

    this.makeMeteorTexture();
    this.makeParticleTexture();
    this.makeGlowDotTexture();

    this.scene.start('Menu');
  }

  private makeMeteorTexture(): void {
    const g = this.add.graphics();
    const r = 34;
    const cx = 40;
    const cy = 40;
    const points: Phaser.Math.Vector2[] = [];
    const spikes = 9;
    for (let i = 0; i < spikes; i++) {
      const angle = (i / spikes) * Math.PI * 2;
      // Deterministic jaggedness (not gameplay RNG, purely cosmetic).
      const wobble = 0.72 + 0.28 * Math.abs(Math.sin(i * 12.9898));
      points.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * r * wobble, cy + Math.sin(angle) * r * wobble));
    }
    g.fillStyle(PALETTE.deepPurple, 1);
    g.lineStyle(3, PALETTE.magenta, 1);
    g.beginPath();
    g.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // Inner crack lines.
    g.lineStyle(2, PALETTE.purple, 1);
    g.lineBetween(cx - 12, cy - 8, cx + 4, cy + 2);
    g.lineBetween(cx + 2, cy - 14, cx + 10, cy + 12);
    g.generateTexture('meteor', 80, 80);
    g.destroy();
  }

  private makeParticleTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('particle', 4, 4);
    g.destroy();
  }

  private makeGlowDotTexture(): void {
    const g = this.add.graphics();
    for (let i = 8; i > 0; i--) {
      g.fillStyle(0xffffff, i === 1 ? 1 : 0.09);
      g.fillCircle(16, 16, i * 2);
    }
    g.generateTexture('glowdot', 32, 32);
    g.destroy();
  }
}
