import Phaser from 'phaser';
import { PALETTE } from './fx/palette';
import { BootScene } from './game/scenes/BootScene';
import { BrainScanScene } from './game/scenes/BrainScanScene';
import { CoachScene } from './game/scenes/CoachScene';
import { CollapseScene } from './game/scenes/CollapseScene';
import { ControlsScene } from './game/scenes/ControlsScene';
import { DebriefScene } from './game/scenes/DebriefScene';
import { ExerciseScene } from './game/scenes/ExerciseScene';
import { ExerciseSelectScene } from './game/scenes/ExerciseSelectScene';
import { ExpressionScene } from './game/scenes/ExpressionScene';
import { FactorScene } from './game/scenes/FactorScene';
import { GameScene } from './game/scenes/GameScene';
import { LeaderboardScene } from './game/scenes/LeaderboardScene';
import { MenuScene } from './game/scenes/MenuScene';
import { ModeSelectScene } from './game/scenes/ModeSelectScene';
import { PauseScene } from './game/scenes/PauseScene';
import { PlaybookScene } from './game/scenes/PlaybookScene';
import { SettingsScene } from './game/scenes/SettingsScene';
import { ShopScene } from './game/scenes/ShopScene';
import { VideoScene } from './game/scenes/VideoScene';

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
    FactorScene,
    CollapseScene,
    ExerciseSelectScene,
    ExerciseScene,
    // BossScene is benched pending a redesign — see the note in MenuScene.
    DebriefScene,
    LeaderboardScene,
    ShopScene,
    BrainScanScene,
    CoachScene,
    PlaybookScene,
    SettingsScene,
    ControlsScene,
    VideoScene,
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
