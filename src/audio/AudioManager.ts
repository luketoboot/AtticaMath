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
  | 'playerHit'
  | 'reload'
  | 'gunFraction'
  | 'gunPercent'
  | 'prime'
  | 'implode'
  | 'boltHit'
  | 'phase'
  | 'comboUp'
  | 'nearMiss'
  | 'sniper'
  | 'waveClear';

export interface SfxOptions {
  /** Frequency multiplier — used to climb the streak ladder. */
  pitch?: number;
  /** Volume multiplier on top of the sfx volume setting. */
  gain?: number;
}

export type MusicTrack = 'menu' | 'game' | 'boss' | 'drift' | 'pulse' | 'debrief';

/** Owner-supplied looping tracks in public/music/. Missing files are skipped. */
const MUSIC_TRACKS: Record<MusicTrack, string> = {
  menu: 'music/Last_Exit_Before_Dawn.mp3',
  game: 'music/Midnight_Interceptor.mp3',
  boss: 'music/Red_Room_Standoff.mp3',
  // Free-flight modes: weightless rather than driving.
  drift: 'music/Black_Glass_Horizon.mp3',
  // The beat-driven counterpart to drift, for when a session needs a push.
  pulse: 'music/Chain_Reaction.mp3',
  // Post-run: the comedown under the stats screen.
  debrief: 'music/Rain_on_the_Pane.mp3',
};

/**
 * One layer of a sampled effect. Real weapon audio is several recordings
 * stacked — a mechanical transient, a body, a tail — so a layer is the unit,
 * not the sound.
 */
interface SampleLayer {
  /** Interchangeable takes; one is drawn at random per trigger. */
  files: readonly string[];
  /** Seconds after the trigger. */
  delay?: number;
  gain?: number;
  /** Reverb send, 0..1. Transients want less than tails. */
  send?: number;
  /** Playback-rate jitter as a fraction, so repeats never phase-lock. */
  pitchVary?: number;
  /**
   * Fixed playback-rate offset baked into this mapping, on top of whatever the
   * caller asks for. Lets one recording serve several events at different
   * weights — a hit pitched up is a block, pitched down is a heavier impact.
   */
  rate?: number;
}

/**
 * Sampled replacements for the procedural effects. Anything listed here that
 * actually loads wins; anything missing silently falls back to synthesis, so
 * the game is fully playable with public/sfx/ empty. See that folder's README
 * for what to drop in.
 */
const SAMPLES: Partial<Record<SfxName, readonly SampleLayer[]>> = {
  gunFraction: [
    { files: ['sfx/gun_fraction_mech.mp3'], gain: 0.5, send: 0.05, pitchVary: 0.05 },
    {
      files: ['sfx/gun_fraction_a.mp3', 'sfx/gun_fraction_b.mp3', 'sfx/gun_fraction_c.mp3'],
      gain: 0.9,
      send: 0.2,
      pitchVary: 0.07,
    },
    { files: ['sfx/gun_fraction_tail.mp3'], delay: 0.02, gain: 0.4, send: 0.6, pitchVary: 0.04 },
  ],
  gunPercent: [
    { files: ['sfx/gun_percent_mech.mp3'], gain: 0.5, send: 0.05, pitchVary: 0.05 },
    {
      files: ['sfx/gun_percent_a.mp3', 'sfx/gun_percent_b.mp3', 'sfx/gun_percent_c.mp3'],
      gain: 0.9,
      send: 0.25,
      pitchVary: 0.07,
    },
    { files: ['sfx/gun_percent_tail.mp3'], delay: 0.02, gain: 0.45, send: 0.65, pitchVary: 0.04 },
  ],
  // Three stages, timed to land inside CONFIG.collapse.swapLockoutSeconds.
  reload: [
    { files: ['sfx/reload_mag.mp3'], gain: 0.75, send: 0.12, pitchVary: 0.03 },
    { files: ['sfx/reload_rack.mp3'], delay: 0.028, gain: 0.85, send: 0.2, pitchVary: 0.03 },
    { files: ['sfx/reload_bolt.mp3'], delay: 0.075, gain: 1, send: 0.35, pitchVary: 0.03 },
  ],
  boltHit: [
    {
      files: ['sfx/bolt_hit_a.mp3', 'sfx/bolt_hit_b.mp3'],
      gain: 0.8,
      send: 0.45,
      pitchVary: 0.12,
    },
  ],
  implode: [
    { files: ['sfx/implode_charge.mp3'], gain: 0.8, send: 0.35 },
    { files: ['sfx/implode_boom.mp3'], delay: 0.32, gain: 1, send: 0.5 },
    { files: ['sfx/implode_debris.mp3'], delay: 0.5, gain: 0.5, send: 0.6 },
  ],
  explosion: [
    {
      files: ['sfx/explosion_a.mp3', 'sfx/explosion_b.mp3'],
      gain: 0.9,
      send: 0.45,
      pitchVary: 0.1,
    },
  ],
  playerHit: [{ files: ['sfx/player_hit.mp3'], gain: 0.9, send: 0.3, pitchVary: 0.05 }],

  // --- the other modes, built from the same recordings ---
  // Meteor Defense and Expression Builder fire the base cannon. Same hardware
  // as Collapse's fraction gun, so it gets the same three layers.
  laser: [
    { files: ['sfx/gun_fraction_mech.mp3'], gain: 0.4, send: 0.05, pitchVary: 0.05 },
    {
      files: ['sfx/gun_fraction_a.mp3', 'sfx/gun_fraction_b.mp3', 'sfx/gun_fraction_c.mp3'],
      gain: 0.85,
      send: 0.2,
      pitchVary: 0.07,
    },
    { files: ['sfx/gun_fraction_tail.mp3'], delay: 0.02, gain: 0.35, send: 0.6, pitchVary: 0.04 },
  ],
  // The spread cannon and Factor Storm's splitter: the heavier weapon.
  laserSpread: [
    { files: ['sfx/gun_percent_mech.mp3'], gain: 0.45, send: 0.05, pitchVary: 0.05 },
    {
      files: ['sfx/gun_percent_a.mp3', 'sfx/gun_percent_b.mp3', 'sfx/gun_percent_c.mp3'],
      gain: 0.9,
      send: 0.25,
      pitchVary: 0.07,
    },
    { files: ['sfx/gun_percent_tail.mp3'], delay: 0.02, gain: 0.4, send: 0.65, pitchVary: 0.04 },
  ],
  // A fast kill should read as the same explosion taken at speed, not as a
  // different event — pitched up, with the bright tail borrowed for shimmer.
  fast: [
    { files: ['sfx/explosion_a.mp3', 'sfx/explosion_b.mp3'], gain: 0.85, send: 0.4, rate: 1.3 },
    { files: ['sfx/gun_fraction_tail.mp3'], delay: 0.03, gain: 0.4, send: 0.6, rate: 1.15 },
  ],
  // The long-shot callout. This is the one sample slot meant for a *voice*: a
  // called-out "SNIPER" the way an arcade shooter announces one. Three takes so
  // a good run does not repeat the same reading, and a low reverb send because
  // a voice line wants to sit forward of the field rather than in it. Until a
  // file exists it synthesizes a ricochet, which reads as the same event.
  sniper: [
    {
      files: ['sfx/vo_sniper_a.mp3', 'sfx/vo_sniper_b.mp3', 'sfx/vo_sniper_c.mp3'],
      gain: 1,
      send: 0.18,
    },
  ],
  // A meteor reaching the ground. The detonation slowed down and weighted.
  land: [
    { files: ['sfx/implode_boom.mp3'], gain: 0.85, send: 0.45, rate: 0.85 },
    { files: ['sfx/player_hit.mp3'], gain: 0.5, send: 0.25, rate: 0.9 },
  ],
  // Boss chip damage: the bolt impact with the heavy gun's mechanism under it.
  bossHit: [
    { files: ['sfx/gun_percent_mech.mp3'], gain: 0.4, send: 0.1, pitchVary: 0.04 },
    { files: ['sfx/bolt_hit_a.mp3', 'sfx/bolt_hit_b.mp3'], gain: 0.85, send: 0.4, rate: 0.9, pitchVary: 0.08 },
  ],
  // Boss death gets the full collapse: charge, detonation, debris.
  bossDown: [
    { files: ['sfx/implode_charge.mp3'], gain: 0.8, send: 0.35 },
    { files: ['sfx/implode_boom.mp3'], delay: 0.32, gain: 1, send: 0.5, rate: 0.92 },
    { files: ['sfx/implode_debris.mp3'], delay: 0.5, gain: 0.55, send: 0.6 },
  ],
  // Blocking an attack is a deflection, not a wound: same strike, pitched up
  // and lighter so it reads as "stopped" rather than "hurt".
  block: [
    { files: ['sfx/bolt_hit_a.mp3', 'sfx/bolt_hit_b.mp3'], gain: 0.6, send: 0.5, rate: 1.3, pitchVary: 0.08 },
  ],
  // Incoming fire: the heavy gun heard from the wrong end. Down-pitched and
  // quiet so it sits behind the player's own weapon in the mix.
  enemyFire: [
    { files: ['sfx/gun_percent_a.mp3'], gain: 0.45, send: 0.4, rate: 0.8, pitchVary: 0.06 },
  ],
};

/** Continuously looping effects, held open while a condition is true. */
export type LoopName = 'thruster';

interface LoopSpec {
  file: string;
  gain: number;
  send: number;
  /** Seconds to ramp in and out — a hard cut on a loop clicks. */
  fadeSeconds: number;
}

const LOOPS: Record<LoopName, LoopSpec> = {
  thruster: { file: 'sfx/thruster_loop.mp3', gain: 0.5, send: 0.25, fadeSeconds: 0.09 },
};

/** A running loop, so it can be re-pitched and faded out later. */
interface ActiveLoop {
  source: AudioBufferSourceNode;
  level: GainNode;
  spec: LoopSpec;
}

const CROSSFADE_MS = 700;
const FADE_STEP_MS = 40;

/** Same tracks in the same order — a re-request of the running rotation. */
function sameList(a: readonly MusicTrack[], b: readonly MusicTrack[]): boolean {
  return a.length === b.length && a.every((track, i) => track === b[i]);
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  /** Shared reverb send. Voices dry-route to sfxGain and bleed here for tail. */
  private reverbSend: GainNode | null = null;
  private unlocked = false;

  /** Decoded sample buffers by path. A path absent here has no sample. */
  private buffers = new Map<string, AudioBuffer>();
  private samplesPrimed = false;
  private loops = new Map<LoopName, ActiveLoop>();
  /** Synthesized loop bodies, built once and reused when no sample exists. */
  private fallbackLoops = new Map<LoopName, AudioBuffer>();

  /** One element per track, created lazily and reused across scene changes. */
  private elements = new Map<MusicTrack, HTMLAudioElement>();
  private fades = new Map<MusicTrack, ReturnType<typeof setInterval>>();
  private current: MusicTrack | null = null;
  /**
   * The rotation the current track belongs to. A single-track request is a
   * rotation of one, which loops; two or more hand off at the end of each track.
   */
  private playlist: readonly MusicTrack[] = [];
  /** Track requested before the autoplay unlock gesture arrived. */
  private pending: readonly MusicTrack[] | null = null;

  sfxVolume: number;
  musicVolume: number;

  constructor(sfxVolume: number, musicVolume: number) {
    this.sfxVolume = sfxVolume;
    this.musicVolume = musicVolume;
    const unlock = (): void => {
      this.unlocked = true;
      this.ensureContext();
      void this.ctx?.resume();
      void this.primeSamples();
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

      // Convolution tail on a send bus. Dry-only synthesis reads as "beeps in a
      // vacuum"; a shared space behind every voice is the cheapest thing that
      // makes procedural SFX sound recorded rather than generated.
      const convolver = this.ctx.createConvolver();
      convolver.buffer = this.makeImpulse(this.ctx, 1.9, 3.1);
      const wet = this.ctx.createGain();
      wet.gain.value = 0.42;
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 1;
      this.reverbSend.connect(convolver);
      convolver.connect(wet);
      wet.connect(this.sfxGain);
    }
    return this.ctx;
  }

  /**
   * Synthesized impulse response: decaying noise, darkened over its length so
   * the tail loses highs the way a real room does. Built once per context.
   */
  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const impulse = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const white = Math.random() * 2 - 1;
        // One-pole lowpass that closes as the tail decays.
        last = white * (1 - t * 0.75) + last * (0.28 + t * 0.5);
        data[i] = last * Math.pow(1 - t, decay);
      }
    }
    return impulse;
  }

  /** Random multiplier around 1 — per-shot variation so repeats never phase. */
  private vary(spread: number): number {
    return 1 + (Math.random() * 2 - 1) * spread;
  }

  // --- looping effects ---

  /**
   * Hold a looping effect open or let it go. Idempotent, so callers can drive
   * it straight from a per-frame boolean without tracking edges themselves.
   *
   * `rate` re-pitches a running loop rather than restarting it, which is what
   * lets reverse thrust sound like the same engine at a different throttle.
   */
  setLoop(name: LoopName, active: boolean, opts: { rate?: number; gain?: number } = {}): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const running = this.loops.get(name);

    if (!active) {
      if (running) this.releaseLoop(ctx, name, running);
      return;
    }

    if (running) {
      // Glide rather than jump: a stepped pitch on a sustained tone reads as a
      // glitch, not as a throttle change.
      running.source.playbackRate.linearRampToValueAtTime(opts.rate ?? 1, ctx.currentTime + 0.08);
      running.level.gain.linearRampToValueAtTime(
        running.spec.gain * (opts.gain ?? 1),
        ctx.currentTime + 0.08,
      );
      return;
    }

    const spec = LOOPS[name];
    const buffer = this.buffers.get(spec.file) ?? this.fallbackLoop(ctx, name);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = opts.rate ?? 1;

    const level = ctx.createGain();
    const target = spec.gain * (opts.gain ?? 1);
    level.gain.setValueAtTime(0.0001, ctx.currentTime);
    level.gain.linearRampToValueAtTime(target, ctx.currentTime + spec.fadeSeconds);

    source.connect(level);
    this.route(ctx, level, spec.send);
    source.start();
    this.loops.set(name, { source, level, spec });
  }

  private releaseLoop(ctx: AudioContext, name: LoopName, loop: ActiveLoop): void {
    this.loops.delete(name);
    const end = ctx.currentTime + loop.spec.fadeSeconds;
    loop.level.gain.cancelScheduledValues(ctx.currentTime);
    loop.level.gain.setValueAtTime(loop.level.gain.value, ctx.currentTime);
    loop.level.gain.linearRampToValueAtTime(0.0001, end);
    loop.source.stop(end + 0.02);
  }

  /** Cut every loop immediately. Scenes call this on shutdown. */
  stopAllLoops(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [name, loop] of [...this.loops]) this.releaseLoop(ctx, name, loop);
  }

  /**
   * Synthesized stand-in for a missing loop sample: filtered noise over a low
   * rumble, rendered once into a buffer whose ends already match, so it loops
   * without a seam. Good enough that thrust is never silent.
   */
  private fallbackLoop(ctx: AudioContext, name: LoopName): AudioBuffer | null {
    const cached = this.fallbackLoops.get(name);
    if (cached) return cached;
    if (name !== 'thruster') return null;

    const seconds = 2;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let lp = 0;
      let lp2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        lp += (white - lp) * 0.06; // body hiss
        lp2 += (lp - lp2) * 0.12; // darkened further
        // Two detuned low sines give the rumble a beat instead of a drone.
        const t = i / rate;
        const rumble = Math.sin(t * Math.PI * 2 * 58) * 0.22 + Math.sin(t * Math.PI * 2 * 87) * 0.1;
        data[i] = lp2 * 2.6 + rumble;
      }
      // Crossfade the tail over the head so the seam is inaudible.
      const blend = Math.floor(rate * 0.05);
      for (let i = 0; i < blend; i++) {
        const w = i / blend;
        data[i] = data[i]! * w + data[length - blend + i]! * (1 - w);
      }
    }
    this.fallbackLoops.set(name, buffer);
    return buffer;
  }

  // --- samples ---

  /**
   * Fetch and decode every declared sample once, after the audio unlock.
   * Failures are swallowed on purpose: a missing file just means that effect
   * keeps using its synthesized version, so the folder can be empty or partial.
   */
  private async primeSamples(): Promise<void> {
    if (this.samplesPrimed) return;
    this.samplesPrimed = true;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const paths = new Set<string>();
    for (const layers of Object.values(SAMPLES)) {
      for (const layer of layers ?? []) for (const file of layer.files) paths.add(file);
    }
    for (const spec of Object.values(LOOPS)) paths.add(spec.file);
    await Promise.all([...paths].map((path) => this.loadSample(ctx, path)));
  }

  private async loadSample(ctx: AudioContext, path: string): Promise<void> {
    try {
      const res = await fetch(path);
      if (!res.ok) return;
      // The dev server answers unknown paths with index.html and a 200, so an
      // ok status is not proof the file exists. Reject markup before decoding
      // it, or every absent sample costs a thrown decode.
      if ((res.headers.get('content-type') ?? '').includes('text/html')) return;
      this.buffers.set(path, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      // No such file, or an undecodable one. Synthesis covers it.
    }
  }

  /**
   * Play the sampled version of an effect. Returns false when nothing loaded,
   * which is the caller's signal to fall through to synthesis.
   */
  private playSample(ctx: AudioContext, name: SfxName, opts: SfxOptions): boolean {
    const layers = SAMPLES[name];
    if (!layers || !this.sfxGain) return false;

    const t = ctx.currentTime;
    const pitch = opts.pitch ?? 1;
    const gain = opts.gain ?? 1;
    // One pan position for the whole effect — layers of a single sound must
    // share a location or the stack smears across the stereo field.
    const pan = (Math.random() * 2 - 1) * 0.22;
    let played = false;

    for (const layer of layers) {
      const choices = layer.files.filter((f) => this.buffers.has(f));
      if (choices.length === 0) continue;
      const buffer = this.buffers.get(choices[Math.floor(Math.random() * choices.length)]!);
      if (!buffer) continue;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = pitch * (layer.rate ?? 1) * this.vary(layer.pitchVary ?? 0);

      const level = ctx.createGain();
      level.gain.value = (layer.gain ?? 1) * gain;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      source.connect(level);
      level.connect(panner);
      this.route(ctx, panner, layer.send ?? 0);
      source.start(t + (layer.delay ?? 0));
      played = true;
    }
    return played;
  }

  // --- music ---

  /**
   * Switch to a track, or to a rotation of them, crossfading from whatever is
   * playing. Re-requesting what is already on is a no-op, so scenes can call
   * this in create() freely — including on restart, where cutting the music back
   * to the top of the same track would be the wrong answer.
   *
   * A rotation exists for the long modes: Collapse has no wave structure to end
   * it, so a single loop wears through. Tracks hand off to each other at the end
   * of each one rather than on any game event.
   */
  playMusic(track: MusicTrack | readonly MusicTrack[]): void {
    const list = typeof track === 'string' ? [track] : track;
    const first = list[0];
    if (first === undefined) return;
    if (!this.unlocked) {
      this.pending = list;
      return;
    }
    this.pending = null;
    // Already running this exact rotation: leave it where it is.
    if (this.current !== null && sameList(this.playlist, list)) return;

    this.playlist = list;
    this.start(first);
  }

  /** Fade the current track out and leave nothing playing. */
  stopMusic(): void {
    if (this.current) this.fadeOut(this.current);
    this.current = null;
    this.playlist = [];
    this.pending = null;
  }

  /** Crossfade to a track from within the current rotation. */
  private start(track: MusicTrack): void {
    const previous = this.current;
    this.current = track;
    if (previous !== null && previous !== track) this.fadeOut(previous);

    const el = this.element(track);
    // Only a rotation of one loops; the rest hand off in handoff().
    el.loop = this.playlist.length <= 1;
    el.currentTime = 0;
    el.volume = 0;
    void el.play().catch(() => undefined);
    this.fadeTo(track, this.musicVolume);
  }

  /**
   * Bring in the next track of the rotation as this one runs out. Driven by
   * timeupdate so the two overlap for the crossfade, with `ended` as the backstop
   * for streams that never report a duration.
   */
  private handoff(track: MusicTrack, ended: boolean): void {
    // Fires ~4x/second: everything below is a cheap reject for the common case.
    if (this.playlist.length < 2 || this.current !== track) return;
    const el = this.elements.get(track);
    if (!el) return;
    if (!ended) {
      if (!Number.isFinite(el.duration)) return;
      if (el.duration - el.currentTime > CROSSFADE_MS / 1000) return;
    }
    const next = this.playlist[(this.playlist.indexOf(track) + 1) % this.playlist.length];
    if (next !== undefined) this.start(next);
  }

  private element(track: MusicTrack): HTMLAudioElement {
    let el = this.elements.get(track);
    if (!el) {
      el = new Audio(MUSIC_TRACKS[track]);
      el.loop = true;
      el.volume = 0;
      el.addEventListener('timeupdate', () => this.handoff(track, false));
      el.addEventListener('ended', () => this.handoff(track, true));
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
    // A loaded sample always beats the synthesized version.
    if (this.playSample(ctx, name, opts)) return;
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

      /**
       * Weapon swap: a full mechanism, not a UI blip. Magazine drops, carrier
       * racks back, bolt slams home. The last hit is the loudest and lowest so
       * the sequence lands instead of trailing off, and the whole thing gets a
       * heavy reverb send so it sounds like it happened in a hangar.
       */
      case 'reload': {
        const v = this.vary(0.03);
        // Magazine release: dry, bright, mechanical.
        this.click(ctx, t, 0.022, 0.3 * g, 0.15);
        this.zap(ctx, t, 'square', 1100 * v, 420 * v, 0.035, 0.09 * g);
        // Carrier racked: a fast scrape, overlapped rather than sequenced.
        this.noiseBurst(ctx, t + 0.028, 0.055, 3400, 0.22 * g, 'bandpass', 0.25);
        this.zap(ctx, t + 0.028, 'sawtooth', 300 * v, 680 * v, 0.05, 0.07 * g, -14);
        // Bolt home: the payoff, and the beat the lockout ends on.
        this.click(ctx, t + 0.075, 0.035, 0.46 * g, 0.4);
        this.zap(ctx, t + 0.075, 'square', 700 * v, 140, 0.07, 0.24 * g, -12);
        this.zap(ctx, t + 0.075, 'sine', 190, 52, 0.17, 0.48 * g, 0, 0.3);
        this.noiseBurst(ctx, t + 0.075, 0.06, 900, 0.2 * g, 'lowpass', 0.2);
        // Ready chirp lands with the bolt rather than after it.
        this.tone(ctx, t + 0.105, 'triangle', 1240 * v * p, 0.055, 0.1 * g, 0, 0.55);
        this.tone(ctx, t + 0.105, 'sine', 1860 * v * p, 0.045, 0.05 * g, 0, 0.55);
        break;
      }

      /**
       * Fraction gun: tight and cutting. Three stacked layers — mechanical
       * transient, the shot body, and a short bright tail — with per-shot
       * detune so sustained fire never machine-guns into a single tone.
       */
      case 'gunFraction': {
        const v = this.vary(0.06);
        this.click(ctx, t, 0.018, 0.26 * g);
        this.zap(ctx, t, 'square', 1900 * v * p, 480 * p, 0.085, 0.16 * g, -7);
        this.zap(ctx, t, 'sawtooth', 2500 * v * p, 820 * p, 0.06, 0.07 * g, 16, 0.35);
        this.zap(ctx, t + 0.004, 'sine', 320 * p, 110, 0.12, 0.16 * g);
        this.noiseBurst(ctx, t, 0.05, 5200, 0.1 * g, 'highpass', 0.3);
        break;
      }

      /** Percent gun: rounder, lower, heavier — told apart by ear alone. */
      case 'gunPercent': {
        const v = this.vary(0.06);
        this.click(ctx, t, 0.02, 0.2 * g);
        this.zap(ctx, t, 'sawtooth', 880 * v * p, 170 * p, 0.13, 0.17 * g, 9);
        this.zap(ctx, t, 'square', 540 * v * p, 120 * p, 0.11, 0.1 * g, -16);
        this.zap(ctx, t + 0.006, 'sine', 230, 62, 0.2, 0.3 * g, 0, 0.25);
        this.noiseBurst(ctx, t, 0.08, 1700, 0.11 * g, 'bandpass', 0.35);
        break;
      }

      /** Bolt biting a token: a short, hard, wet crack. */
      case 'boltHit': {
        const v = this.vary(0.09);
        this.noiseBurst(ctx, t, 0.075, 4200 * v, 0.2 * g, 'bandpass', 0.45);
        this.zap(ctx, t, 'triangle', 900 * v * p, 220, 0.07, 0.13 * g);
        this.click(ctx, t, 0.014, 0.16 * g, 0.3);
        break;
      }

      /** Target armed: two-note rise, wet, unmistakably "held and waiting". */
      case 'prime':
        this.tone(ctx, t, 'square', 720 * p, 0.055, 0.11 * g, 0, 0.3);
        this.tone(ctx, t + 0.055, 'square', 1080 * p, 0.09, 0.12 * g, 0, 0.5);
        this.tone(ctx, t + 0.055, 'sine', 2160 * p, 0.07, 0.05 * g, 0, 0.5);
        this.click(ctx, t, 0.016, 0.09 * g);
        break;

      /** Phasing through matter: a soft filtered woosh, no transient. */
      case 'phase':
        this.noiseBurst(ctx, t, 0.24, 1200 * p, 0.11 * g, 'bandpass', 0.5);
        this.zap(ctx, t, 'sine', 420 * p, 180 * p, 0.22, 0.06 * g, 0, 0.5);
        break;

      /** Chain step: a rung on a ladder. Pitch is supplied by the caller. */
      case 'comboUp':
        this.tone(ctx, t, 'square', 660 * p, 0.06, 0.09 * g, 0, 0.45);
        this.tone(ctx, t + 0.045, 'square', 990 * p, 0.08, 0.08 * g, 0, 0.55);
        this.click(ctx, t, 0.012, 0.08 * g);
        break;

      /**
       * A shot that crossed the field. No synthesizer says "SNIPER", so this
       * says the other half of the trope instead: the ricochet whine, a bright
       * strike falling away in two whistles that drift apart as they go.
       */
      case 'sniper':
        this.click(ctx, t, 0.01, 0.1 * g);
        this.tone(ctx, t, 'triangle', 2600 * p, 0.05, 0.07 * g, 0, 0.5);
        this.zap(ctx, t + 0.02, 'sine', 3200 * p, 900 * p, 0.42, 0.06 * g, 0, 0.8);
        this.zap(ctx, t + 0.09, 'sine', 2400 * p, 700 * p, 0.5, 0.045 * g, 22, 0.85);
        this.noiseBurst(ctx, t, 0.12, 4200, 0.04 * g, 'highpass', 0.6);
        break;

      /** Threaded a gap: a thin doppler whip, mostly tail. */
      case 'nearMiss':
        this.noiseBurst(ctx, t, 0.16, 2600, 0.09 * g, 'bandpass', 0.6);
        this.zap(ctx, t, 'sine', 1500, 500, 0.14, 0.05 * g, 0, 0.55);
        break;

      /** Board cleared: a short rising triad that resolves. */
      case 'waveClear':
        this.tone(ctx, t, 'triangle', 523 * p, 0.16, 0.1 * g, 0, 0.5);
        this.tone(ctx, t + 0.08, 'triangle', 659 * p, 0.16, 0.1 * g, 0, 0.5);
        this.tone(ctx, t + 0.16, 'triangle', 784 * p, 0.34, 0.12 * g, 0, 0.65);
        this.tone(ctx, t + 0.16, 'sine', 1568 * p, 0.3, 0.05 * g, 0, 0.65);
        this.noiseBurst(ctx, t + 0.16, 0.22, 3000, 0.07 * g, 'highpass', 0.5);
        break;

      /**
       * The collapse. Inrush rises and cuts to nothing, then the detonation
       * lands in the silence — the gap is what sells it, not more noise. Ends
       * on a long sub drop and a debris rattle so it has a real tail.
       */
      case 'implode': {
        const v = this.vary(0.04);
        // Inrush: two sweeps climbing against each other, plus rising air.
        this.zap(ctx, t, 'sawtooth', 240, 2600 * v, 0.28, 0.13 * g, -20, 0.3);
        this.zap(ctx, t, 'square', 180, 2050 * v, 0.28, 0.09 * g, 24, 0.3);
        this.noiseBurst(ctx, t, 0.28, 800, 0.14 * g, 'highpass', 0.4);
        this.tone(ctx, t + 0.2, 'sine', 60, 0.1, 0.2 * g);
        // Detonation, after the beat of silence.
        this.noiseBurst(ctx, t + 0.32, 0.52, 4600, 0.46 * g, 'lowpass', 0.55);
        this.zap(ctx, t + 0.32, 'sine', 240, 28, 0.7, 0.6 * g, 0, 0.35);
        this.zap(ctx, t + 0.32, 'triangle', 520, 64, 0.42, 0.24 * g, 0, 0.4);
        this.zap(ctx, t + 0.32, 'sawtooth', 1400, 300, 0.2, 0.12 * g, -30, 0.5);
        this.click(ctx, t + 0.32, 0.05, 0.3 * g, 0.4);
        // Bright ring-off and debris.
        this.tone(ctx, t + 0.36, 'square', 1320 * p, 0.18, 0.09 * g, 0, 0.7);
        this.noiseBurst(ctx, t + 0.5, 0.42, 2200, 0.09 * g, 'highpass', 0.6);
        break;
      }

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
    send = 0,
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
    this.route(ctx, gain, send);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Dry to the sfx bus, with an optional parallel bleed into the reverb. */
  private route(ctx: AudioContext, node: AudioNode, send: number): void {
    node.connect(this.sfxGain!);
    if (send <= 0 || !this.reverbSend) return;
    const tap = ctx.createGain();
    tap.gain.value = send;
    node.connect(tap);
    tap.connect(this.reverbSend);
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
    send = 0,
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
    this.route(ctx, gain, send);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Very short noise transient — the "crack" in front of a laser or click. */
  private click(ctx: AudioContext, start: number, duration: number, peak: number, send = 0): void {
    this.noiseBurst(ctx, start, duration, 7000, peak, 'highpass', send);
  }

  /** Filtered white-noise burst — explosions, impacts, air. */
  private noiseBurst(
    ctx: AudioContext,
    start: number,
    duration: number,
    filterFrom: number,
    peak: number,
    filterType: BiquadFilterType = 'lowpass',
    send = 0,
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
    this.route(ctx, gain, send);
    source.start(start);
  }
}

export const AUDIO_REGISTRY_KEY = 'audioManager';
