import Phaser from 'phaser';
import { CONFIG } from '../core/config';

/**
 * CRT post-processing: barrel distortion, scanlines, chromatic aberration,
 * phosphor bloom, vignette, subtle flicker.
 *
 * Glow is a threshold bloom — only pixels above uThreshold bleed — so neon on
 * black blooms hard while the black stays black. uGlow is driven per frame and
 * can be spiked with pulse() for a kill flash.
 */
const FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGlow;
uniform float uThreshold;

varying vec2 outTexCoord;

vec2 barrel(vec2 uv) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return uv + c * r2 * 0.12;
}

/** Portion of a sample that is above the bloom threshold. */
vec3 bright(vec2 uv) {
  vec3 s = texture2D(uMainSampler, uv).rgb;
  return max(s - uThreshold, 0.0) / (1.0 - uThreshold);
}

void main() {
  vec2 uv = barrel(outTexCoord);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Chromatic aberration: split channels radially, widening with the glow pulse.
  vec2 c = uv - 0.5;
  float aber = (0.0026 + uGlow * 0.0016) * length(c) * 2.0;
  float rC = texture2D(uMainSampler, uv + c * aber).r;
  float gC = texture2D(uMainSampler, uv).g;
  float bC = texture2D(uMainSampler, uv - c * aber).b;
  vec3 col = vec3(rC, gC, bC);

  // Phosphor bloom: two rings of taps (tight + wide) over the bright pass.
  vec2 px = 1.0 / uResolution;
  vec3 near = bright(uv + vec2(px.x * 2.0, 0.0))
            + bright(uv - vec2(px.x * 2.0, 0.0))
            + bright(uv + vec2(0.0, px.y * 2.0))
            + bright(uv - vec2(0.0, px.y * 2.0));
  vec3 far = bright(uv + vec2(px.x * 6.0, px.y * 6.0))
           + bright(uv - vec2(px.x * 6.0, px.y * 6.0))
           + bright(uv + vec2(px.x * 6.0, -px.y * 6.0))
           + bright(uv - vec2(px.x * 6.0, -px.y * 6.0))
           + bright(uv + vec2(px.x * 11.0, 0.0))
           + bright(uv - vec2(px.x * 11.0, 0.0))
           + bright(uv + vec2(0.0, px.y * 11.0))
           + bright(uv - vec2(0.0, px.y * 11.0));
  col += (near * 0.20 + far * 0.085) * uGlow;

  // Scanlines.
  float scan = 0.86 + 0.14 * sin(uv.y * uResolution.y * 3.14159);
  col *= scan;

  // Slow scanline roll drifting down the screen.
  float roll = 0.985 + 0.015 * sin((uv.y + uTime * 0.06) * 6.2831);
  col *= roll;

  // Slight horizontal mask stripes (aperture grille feel).
  float grille = 0.95 + 0.05 * sin(uv.x * uResolution.x * 3.14159);
  col *= grille;

  // Vignette.
  float vig = 1.0 - dot(c, c) * 0.9;
  col *= clamp(vig, 0.0, 1.0);

  // Subtle flicker.
  col *= 0.985 + 0.015 * sin(uTime * 60.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class CrtPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  static readonly KEY = 'CrtPipeline';
  private elapsed = 0;
  /** Transient glow added on top of the baseline, decaying every frame. */
  private boost = 0;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAG, name: CrtPipeline.KEY });
  }

  /** Spike the phosphor glow; it decays back to the baseline on its own. */
  pulse(amount: number): void {
    this.boost = Math.max(this.boost, amount);
  }

  override onPreRender(): void {
    const dt = this.game.loop.delta / 1000;
    this.elapsed += dt;
    this.boost = Math.max(0, this.boost - CONFIG.juice.glowPulseDecayPerSecond * dt * this.boost);
    if (this.boost < 0.002) this.boost = 0;

    this.set1f('uTime', this.elapsed);
    this.set1f('uGlow', CONFIG.juice.crtGlowBase + this.boost);
    this.set1f('uThreshold', 0.28);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}
