import Phaser from 'phaser';
import { PALETTE } from './fx/palette';
import { BootScene } from './game/scenes/BootScene';
import { BrainScanScene } from './game/scenes/BrainScanScene';
import { DebriefScene } from './game/scenes/DebriefScene';
import { ExpressionScene } from './game/scenes/ExpressionScene';
import { GameScene } from './game/scenes/GameScene';
import { MenuScene } from './game/scenes/MenuScene';
import { ModeSelectScene } from './game/scenes/ModeSelectScene';
import { PauseScene } from './game/scenes/PauseScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { ShopScene } from './game/scenes/ShopScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: PALETTE.black,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    MenuScene,
    ModeSelectScene,
    GameScene,
    ExpressionScene,
    DebriefScene,
    ShopScene,
    BrainScanScene,
    SettingsScene,
    PauseScene,
  ],
});

declare global {
  interface Window {
    __game?: Phaser.Game;
  }
}
if (import.meta.env.DEV) {
  window.__game = game;
}
