import Phaser from 'phaser';
import { PALETTE } from './fx/palette';
import { BootScene } from './game/scenes/BootScene';
import { BrainScanScene } from './game/scenes/BrainScanScene';
import { CoachScene } from './game/scenes/CoachScene';
import { CollapseScene } from './game/scenes/CollapseScene';
import { ControlsScene } from './game/scenes/ControlsScene';
import { DailyScene } from './game/scenes/DailyScene';
import { DebriefScene } from './game/scenes/DebriefScene';
import { ExerciseScene } from './game/scenes/ExerciseScene';
import { ExerciseSelectScene } from './game/scenes/ExerciseSelectScene';
import { ExpressionSelectScene } from './game/scenes/ExpressionSelectScene';
import { ExpressionScene } from './game/scenes/ExpressionScene';
import { CagesScene } from './game/scenes/CagesScene';
import { CagesLearnScene } from './game/scenes/CagesLearnScene';
import { KakoomaScene } from './game/scenes/KakoomaScene';
import { KakoomaSelectScene } from './game/scenes/KakoomaSelectScene';
import { FactorScene } from './game/scenes/FactorScene';
import { HelpScene } from './game/scenes/HelpScene';
import { GameScene } from './game/scenes/GameScene';
import { LeaderboardScene } from './game/scenes/LeaderboardScene';
import { MenuScene } from './game/scenes/MenuScene';
import { ModeSelectScene } from './game/scenes/ModeSelectScene';
import { PauseScene } from './game/scenes/PauseScene';
import { PlaybookScene } from './game/scenes/PlaybookScene';
import { PolarityScene } from './game/scenes/PolarityScene';
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
    ExpressionSelectScene,
    ExpressionScene,
    FactorScene,
    KakoomaSelectScene,
    KakoomaScene,
    CagesScene,
    CagesLearnScene,
    CollapseScene,
    PolarityScene,
    ExerciseSelectScene,
    ExerciseScene,
    // BossScene is benched pending a redesign — see the note in MenuScene.
    DebriefScene,
    DailyScene,
    LeaderboardScene,
    ShopScene,
    BrainScanScene,
    CoachScene,
    PlaybookScene,
    SettingsScene,
    ControlsScene,
    VideoScene,
    PauseScene,
    HelpScene,
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
