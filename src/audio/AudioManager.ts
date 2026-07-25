/**
 * Procedural WebAudio SFX + music manager. No audio assets are generated at
 * build time; every effect is synthesized. Music tracks are owner-supplied
 * files dropped into public/music/ — missing files are silently skipped.
 *
 * The AudioContext unlocks on the first user gesture (browser autoplay policy).
 */

export type SfxName =
  | 'laser'
  | 'laserSpread'
  | 'explosion'
  | 'land'
  | 'shield'
  | 'slowfield'
  | 'error'
  | 'ui'
  | 'purchase'
  | 'wave'
  | 'tip'
  | 'gameover'
  | 'fast'
  | 'bossHit'
  | 'bossDown'
  | 'block'
  | 'enemyFire'
  | 'playerHit';

export interface SfxOptions {
  /** Frequency multiplier — used to climb the streak ladder. */
  pitch?: number;
  /** Volume multiplier on top of the sfx volume setting. */
  gain?: number;
}

export type MusicTrack = 'menu' | 'game' | 'boss';

/** Owner-supplied looping tracks in public/music/. Missing files are skipped. */
const MUSIC_TRACKS: Record<MusicTrack, string> = {
  menu: 'music/Last_Exit_Before_Dawn.mp3',
  game: 'music/Midnight_Interceptor.mp3',
  boss: 'music/Red_Room_Standoff.mp3',
};

const CROSSFADE_MS = 700;
const FADE_STEP_MS = 40;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private unlocked = false;

  /** One element per track, created lazily and reused across scene changes. */
  private elements = new Map<MusicTrack, HTMLAudioElement>();
  private fades = new Map<MusicTrack, ReturnType<typeof setInterval>>();
  private current: MusicTrack | null = null;
  /** Track requested before the autoplay unlock gesture arrived. */
  private pending: MusicTrack | null = null;

  sfxVolume: number;
  musicVolume: number;

  constructor(sfxVolume: number, musicVolume: number) {
    this.sfxVolume = sfxVolume;
    this.musicVolume = musicVolume;
    const unlock = (): void => {
      this.unlocked = true;
      this.ensureContext();
      void this.ctx?.resume();
      if (this.pending) this.playMusic(this.pending);
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
    // Only the playing track tracks the new volume; faded-out ones stay silent.
    if (this.current) {
      const el = this.elements.get(this.current);
      if (el && !this.fades.has(this.current)) el.volume = music;
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.unlocked) return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      // Limiter: layered explosions stack hard, and clipping sounds like a bug.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.18;
      this.sfxGain.connect(limiter);
      limiter.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // --- music ---

  /**
   * Switch to a named track, crossfading from whatever is playing. Re-requesting
   * the current track is a no-op, so scenes can call this in create() freely.
   */
  playMusic(track: MusicTrack): void {
    if (!this.unlocked) {
      this.pending = track;
      return;
    }
    this.pending = null;
    if (this.current === track) return;

    const previous = this.current;
    this.current = track;
    if (previous) this.fadeOut(previous);

    const el = this.element(track);
    el.volume = 0;
    void el.play().catch(() => undefined);
    this.fadeTo(track, this.musicVolume);
  }

  /** Fade the current track out and leave nothing playing. */
  stopMusic(): void {
    if (this.current) this.fadeOut(this.current);
    this.current = null;
    this.pending = null;
  }

  private element(track: MusicTrack): HTMLAudioElement {
    let el = this.elements.get(track);
    if (!el) {
      el = new Audio(MUSIC_TRACKS[track]);
      el.loop = true;
      el.volume = 0;
      this.elements.set(track, el);
    }
    return el;
  }

  private fadeOut(track: MusicTrack): void {
    this.fadeTo(track, 0, () => {
      const el = this.elements.get(track);
      if (!el) return;
      el.pause();
      el.currentTime = 0;
    });
  }

  /** Linear volume ramp over CROSSFADE_MS. Cancels any ramp already running. */
  private fadeTo(track: MusicTrack, target: number, done?: () => void): void {
    const el = this.element(track);
    const existing = this.fades.get(track);
    if (existing !== undefined) clearInterval(existing);

    const from = el.volume;
    const steps = Math.max(1, Math.round(CROSSFADE_MS / FADE_STEP_MS));
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / steps);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t >= 1) {
        clearInterval(timer);
        this.fades.delete(track);
        done?.();
      }
    }, FADE_STEP_MS);
    this.fades.set(track, timer);
  }

  // --- sfx ---

  play(name: SfxName, opts: SfxOptions = {}): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    const p = opts.pitch ?? 1;
    const g = opts.gain ?? 1;

    switch (name) {
      // Base cannon: detuned square pair sweeping down, with a click transient.
      case 'laser':
        this.zap(ctx, t, 'square', 1400 * p, 180 * p, 0.14, 0.22 * g, -8);
        this.zap(ctx, t, 'sawtooth', 1380 * p, 170 * p, 0.14, 0.12 * g, 14);
        this.click(ctx, t, 0.03, 0.3 * g);
        break;

      // Spread cannon: three staggered voices fanning out. Wider, heavier.
      case 'laserSpread':
        this.zap(ctx, t, 'sawtooth', 1500 * p, 150 * p, 0.2, 0.16 * g, -22);
        this.zap(ctx, t + 0.018, 'square', 1250 * p, 200 * p, 0.2, 0.14 * g, 0);
        this.zap(ctx, t + 0.036, 'sawtooth', 1050 * p, 240 * p, 0.22, 0.12 * g, 26);
        this.noiseBurst(ctx, t, 0.16, 2600, 0.14 * g, 'bandpass');
        this.click(ctx, t, 0.04, 0.32 * g);
        break;

      // Kill: noise crack + body thump + sub drop.
      case 'explosion':
        this.noiseBurst(ctx, t, 0.28, 3200 * p, 0.42 * g);
        this.zap(ctx, t, 'triangle', 320 * p, 48, 0.3, 0.3 * g);
        this.zap(ctx, t, 'sine', 130, 34, 0.42, 0.5 * g);
        break;

      // Fast kill: same body, plus a bright rising arpeggio that rides pitch.
      case 'fast':
        this.noiseBurst(ctx, t, 0.22, 4000 * p, 0.34 * g);
        this.zap(ctx, t, 'sine', 150, 40, 0.34, 0.42 * g);
        this.tone(ctx, t, 'square', 880 * p, 0.05, 0.13 * g);
        this.tone(ctx, t + 0.045, 'square', 1320 * p, 0.05, 0.13 * g);
        this.tone(ctx, t + 0.09, 'square', 1760 * p, 0.09, 0.14 * g);
        break;

      // Meteor landing: big filtered impact, long sub tail, debris rattle.
      case 'land':
        this.noiseBurst(ctx, t, 0.7, 700, 0.6 * g);
        this.zap(ctx, t, 'sawtooth', 150, 26, 0.6, 0.42 * g);
        this.zap(ctx, t + 0.02, 'sine', 90, 24, 0.85, 0.55 * g);
        this.noiseBurst(ctx, t + 0.09, 0.35, 1600, 0.16 * g, 'highpass');
        break;

      // Shield absorb: metallic ring instead of an impact — clearly "no damage".
      case 'shield':
        this.tone(ctx, t, 'sine', 520 * p, 0.5, 0.24 * g);
        this.tone(ctx, t, 'sine', 784 * p, 0.45, 0.16 * g, 12);
        this.tone(ctx, t, 'triangle', 1568 * p, 0.3, 0.08 * g, -14);
        this.noiseBurst(ctx, t, 0.2, 5000, 0.1 * g, 'bandpass');
        break;

      // Slow field: downward whoosh, the sound of time thickening.
      case 'slowfield':
        this.zap(ctx, t, 'sine', 900, 180, 0.8, 0.18 * g);
        this.noiseBurst(ctx, t, 0.8, 1800, 0.14 * g, 'bandpass');
        break;

      // Boss chip: dirty detuned stab.
      case 'bossHit':
        this.zap(ctx, t, 'sawtooth', 420 * p, 90, 0.26, 0.3 * g, -18);
        this.zap(ctx, t, 'square', 415 * p, 88, 0.26, 0.2 * g, 20);
        this.noiseBurst(ctx, t, 0.22, 2400, 0.28 * g);
        this.zap(ctx, t, 'sine', 120, 36, 0.4, 0.42 * g);
        break;

      // Boss down: layered collapse, longer than anything else in the bank.
      case 'bossDown':
        this.zap(ctx, t, 'sawtooth', 700, 60, 1.4, 0.32 * g, -14);
        this.zap(ctx, t + 0.05, 'sawtooth', 660, 50, 1.4, 0.26 * g, 18);
        this.noiseBurst(ctx, t, 1.2, 3000, 0.45 * g);
        this.zap(ctx, t + 0.1, 'sine', 110, 28, 1.6, 0.5 * g);
        break;

      // Meteor gunfire: thin spit that sweeps *up*, the mirror of the player's
      // cannon, so incoming and outgoing fire never sound alike.
      case 'enemyFire':
        this.zap(ctx, t, 'sawtooth', 220 * p, 760 * p, 0.13, 0.13 * g, 30);
        this.zap(ctx, t, 'square', 216 * p, 740 * p, 0.13, 0.08 * g, -30);
        this.noiseBurst(ctx, t, 0.08, 3200, 0.1 * g, 'bandpass');
        break;

      // Player takes a shot: dull crunch under an alarm blip.
      case 'playerHit':
        this.noiseBurst(ctx, t, 0.34, 1200, 0.4 * g);
        this.zap(ctx, t, 'sawtooth', 300, 60, 0.36, 0.28 * g, -20);
        this.zap(ctx, t, 'sine', 110, 40, 0.5, 0.45 * g);
        this.tone(ctx, t + 0.1, 'square', 330, 0.14, 0.12 * g);
        break;

      // Block: short upward chirp — reads as a parry, not a hit.
      case 'block':
        this.zap(ctx, t, 'square', 400 * p, 1100 * p, 0.12, 0.18 * g);
        this.noiseBurst(ctx, t, 0.1, 4000, 0.14 * g, 'bandpass');
        break;

      case 'error':
        this.tone(ctx, t, 'sawtooth', 200, 0.16, 0.16 * g);
        this.tone(ctx, t, 'sawtooth', 212, 0.16, 0.16 * g);
        this.tone(ctx, t + 0.07, 'sawtooth', 150, 0.18, 0.14 * g);
        break;

      case 'ui':
        this.tone(ctx, t, 'square', 880 * p, 0.035, 0.1 * g);
        this.click(ctx, t, 0.02, 0.14 * g);
        break;

      case 'purchase':
        this.tone(ctx, t, 'square', 523, 0.08, 0.16 * g);
        this.tone(ctx, t + 0.08, 'square', 784, 0.08, 0.16 * g);
        this.tone(ctx, t + 0.16, 'square', 1047, 0.2, 0.18 * g);
        this.tone(ctx, t + 0.16, 'sine', 1568, 0.24, 0.08 * g, 8);
        break;

      case 'wave':
        this.zap(ctx, t, 'sawtooth', 90, 520, 0.5, 0.16 * g, -12);
        this.zap(ctx, t, 'sawtooth', 92, 528, 0.5, 0.16 * g, 12);
        this.tone(ctx, t + 0.5, 'square', 880, 0.1, 0.14 * g);
        this.noiseBurst(ctx, t + 0.42, 0.3, 6000, 0.12 * g, 'highpass');
        break;

      case 'tip':
        this.tone(ctx, t, 'sine', 880, 0.25, 0.1 * g);
        this.tone(ctx, t + 0.02, 'sine', 1318, 0.3, 0.07 * g);
        break;

      case 'gameover':
        this.zap(ctx, t, 'sawtooth', 440, 42, 1.4, 0.28 * g, -16);
        this.zap(ctx, t + 0.03, 'sawtooth', 430, 40, 1.4, 0.24 * g, 16);
        this.noiseBurst(ctx, t + 0.15, 1.1, 500, 0.42 * g);
        break;
    }
  }

  /**
   * Single fixed-pitch tone with a short attack and exponential decay. The
   * 4ms attack (rather than an instant jump) is what keeps layered sounds from
   * clicking.
   */
  private tone(
    ctx: AudioContext,
    start: number,
    type: OscillatorType,
    freq: number,
    duration: number,
    peak: number,
    detune = 0,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.004);
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
    detune = 0,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(Math.max(1, from), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Very short noise transient — the "crack" in front of a laser or click. */
  private click(ctx: AudioContext, start: number, duration: number, peak: number): void {
    this.noiseBurst(ctx, start, duration, 7000, peak, 'highpass');
  }

  /** Filtered white-noise burst — explosions, impacts, air. */
  private noiseBurst(
    ctx: AudioContext,
    start: number,
    duration: number,
    filterFrom: number,
    peak: number,
    filterType: BiquadFilterType = 'lowpass',
  ): void {
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrom, start);
    // Lowpass sweeps closed (a body decaying); the others hold their corner.
    if (filterType === 'lowpass') {
      filter.frequency.exponentialRampToValueAtTime(60, start + duration);
    } else if (filterType === 'bandpass') {
      filter.Q.value = 2.5;
    }
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
