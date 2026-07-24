/**
 * Procedural WebAudio SFX + music manager. No audio assets are generated at
 * build time; every effect is synthesized. Music tracks are owner-supplied
 * files dropped into public/music/ — missing files are silently skipped.
 *
 * The AudioContext unlocks on the first user gesture (browser autoplay policy).
 */

export type SfxName =
  | 'laser'
  | 'explosion'
  | 'land'
  | 'error'
  | 'ui'
  | 'purchase'
  | 'wave'
  | 'tip'
  | 'gameover'
  | 'fast';

/** Owner-supplied looping tracks, tried in order. First one that loads plays. */
const MUSIC_CANDIDATES = ['music/loop.mp3', 'music/loop.ogg', 'music/track1.mp3'];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private musicStarted = false;
  private unlocked = false;

  sfxVolume: number;
  musicVolume: number;

  constructor(sfxVolume: number, musicVolume: number) {
    this.sfxVolume = sfxVolume;
    this.musicVolume = musicVolume;
    const unlock = (): void => {
      this.unlocked = true;
      this.ensureContext();
      void this.ctx?.resume();
      this.startMusic();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    if (this.music) this.music.volume = music;
  }

  private ensureContext(): AudioContext | null {
    if (!this.unlocked) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // --- music ---

  private startMusic(): void {
    if (this.musicStarted) return;
    this.musicStarted = true;
    this.tryTrack(0);
  }

  private tryTrack(index: number): void {
    const src = MUSIC_CANDIDATES[index];
    if (!src) return;
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = this.musicVolume;
    audio.addEventListener('canplaythrough', () => {
      this.music = audio;
      void audio.play().catch(() => undefined);
    });
    audio.addEventListener('error', () => this.tryTrack(index + 1));
  }

  // --- sfx ---

  play(name: SfxName): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'laser':
        this.zap(ctx, t, 'square', 900, 120, 0.12, 0.25);
        break;
      case 'explosion':
        this.noiseBurst(ctx, t, 0.35, 900, 0.5);
        this.zap(ctx, t, 'triangle', 220, 40, 0.3, 0.2);
        break;
      case 'land':
        this.noiseBurst(ctx, t, 0.6, 500, 0.7);
        this.zap(ctx, t, 'sawtooth', 110, 30, 0.5, 0.35);
        break;
      case 'error':
        this.tone(ctx, t, 'sawtooth', 220, 0.14, 0.18);
        this.tone(ctx, t, 'sawtooth', 233, 0.14, 0.18);
        break;
      case 'ui':
        this.tone(ctx, t, 'sine', 660, 0.06, 0.15);
        break;
      case 'purchase':
        this.tone(ctx, t, 'sine', 523, 0.09, 0.2);
        this.tone(ctx, t + 0.09, 'sine', 784, 0.14, 0.2);
        break;
      case 'wave':
        this.zap(ctx, t, 'sawtooth', 110, 440, 0.4, 0.15);
        this.tone(ctx, t + 0.4, 'square', 880, 0.08, 0.12);
        break;
      case 'tip':
        this.tone(ctx, t, 'sine', 880, 0.25, 0.12);
        this.tone(ctx, t + 0.02, 'sine', 1318, 0.3, 0.08);
        break;
      case 'gameover':
        this.zap(ctx, t, 'sawtooth', 440, 55, 1.1, 0.3);
        this.noiseBurst(ctx, t + 0.15, 0.9, 400, 0.5);
        break;
      case 'fast':
        this.tone(ctx, t, 'square', 660, 0.05, 0.12);
        this.tone(ctx, t + 0.05, 'square', 880, 0.05, 0.12);
        this.tone(ctx, t + 0.1, 'square', 1320, 0.08, 0.12);
        break;
    }
  }

  /** Single fixed-pitch tone with a fast decay envelope. */
  private tone(
    ctx: AudioContext,
    start: number,
    type: OscillatorType,
    freq: number,
    duration: number,
    peak: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Pitch sweep (up or down) with decay — lasers, stingers, game over. */
  private zap(
    ctx: AudioContext,
    start: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    peak: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Filtered white-noise burst — explosions and impacts. */
  private noiseBurst(
    ctx: AudioContext,
    start: number,
    duration: number,
    filterFrom: number,
    peak: number,
  ): void {
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(60, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);
    source.start(start);
  }
}

export const AUDIO_REGISTRY_KEY = 'audioManager';
