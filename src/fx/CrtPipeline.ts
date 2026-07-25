import Phaser from 'phaser';
import { CONFIG } from '../core/config';

/**
 * CRT post-processing: a curved glass tube rather than a scanline filter.
 *
 * The pass is built in the order light actually reaches the eye — the beam hits
 * the phosphor, the phosphor is seen through the shadow mask, and the whole
 * thing is seen through a sheet of glass that reflects the room. Doing it in
 * that order is what stops it reading as "scanline overlay on a flat image":
 *
 *   1. barrel the sampling so the picture sits on a curved surface
 *   2. beam:  chromatic split, bloom over a brightness threshold, edge defocus
 *   3. tube:  scanlines and the RGB aperture mask, in screen space
 *   4. glass: rounded edge, lit rim, specular sheen, vignette
 *
 * The mask and scanlines are deliberately *not* barrelled: the mask is a
 * physical grille bonded to the front of the tube, so the image warps across it
 * and it stays put. That mismatch is most of why a real tube looks like glass.
 *
 * Glare is added in proportion to how dark the pixel already is. A reflection
 * is only visible where the phosphor is not out-shouting it, which happens to
 * be exactly the behaviour that keeps neon-on-black readable at speed.
 */
const FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGlow;
uniform float uThreshold;
uniform float uCurvature;
uniform float uCornerRadius;
uniform float uMask;
uniform float uScanline;
uniform float uGlare;
uniform float uAberration;
uniform float uVignette;

varying vec2 outTexCoord;

/** Push samples outward so the picture lies on a curved tube face. */
vec2 barrel(vec2 uv) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return uv + c * r2 * uCurvature;
}

/** Signed distance to a rounded rectangle; negative inside. */
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

/** Portion of a sample that is above the bloom threshold. */
vec3 bright(vec2 uv) {
  vec3 s = texture2D(uMainSampler, uv).rgb;
  return max(s - uThreshold, 0.0) / (1.0 - uThreshold);
}

void main() {
  vec2 uv = barrel(outTexCoord);
  vec2 c = uv - 0.5;
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  // --- glass edge -----------------------------------------------------------
  // Everything outside the rounded face is bezel, so it is resolved before any
  // sampling work is done.
  float d = roundedBox(c, vec2(0.5), uCornerRadius);
  if (d > 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Narrow, so the darkening reads as the tube turning away rather than as a
  // gradient eating the HUD that lives near the edges.
  float edge = clamp(-d / 0.028, 0.0, 1.0);   // 0 at the rim, 1 well inside

  // --- beam -----------------------------------------------------------------
  float radius = length(c);
  float aber = (uAberration + uGlow * 0.0016) * radius * 2.0;
  float rC = texture2D(uMainSampler, uv + c * aber).r;
  float gC = texture2D(uMainSampler, uv).g;
  float bC = texture2D(uMainSampler, uv - c * aber).b;
  vec3 col = vec3(rC, gC, bC);

  vec2 px = 1.0 / uResolution;

  // Focus falls off toward the corners on a real tube, so the edges get a
  // touch of radial smear rather than staying laser-sharp.
  float defocus = (1.0 - edge) * 0.9 + radius * 0.35;
  vec3 soft = texture2D(uMainSampler, uv + c * px.x * 3.0).rgb
            + texture2D(uMainSampler, uv - c * px.x * 3.0).rgb
            + texture2D(uMainSampler, uv + vec2(c.y, -c.x) * px.y * 3.0).rgb
            + texture2D(uMainSampler, uv - vec2(c.y, -c.x) * px.y * 3.0).rgb;
  col = mix(col, soft * 0.25, clamp(defocus * 0.55, 0.0, 0.5));

  // Phosphor bloom: two rings of taps over the bright pass.
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

  // --- tube face ------------------------------------------------------------
  // Screen space, not picture space: the grille is bonded to the glass and does
  // not move with the barrelled image.
  vec2 screen = gl_FragCoord.xy;

  // Scanlines with a beam profile — bright core, dark gap, not a sine wave.
  float line = fract(screen.y * 0.5);
  float beam = 1.0 - uScanline * smoothstep(0.35, 0.5, abs(line - 0.5));
  col *= beam;

  // RGB aperture mask: each screen column favours one phosphor.
  float slot = mod(screen.x, 3.0);
  vec3 stripe = slot < 1.0 ? vec3(1.0, 0.5, 0.6)
              : slot < 2.0 ? vec3(0.5, 1.0, 0.6)
                           : vec3(0.6, 0.5, 1.0);
  col *= mix(vec3(1.0), stripe, uMask);
  // The mask eats light, so give it back — a masked tube is not a dim one.
  col *= 1.0 + uMask * 0.55;

  // Slow roll and mains flicker, both barely there.
  col *= 0.99 + 0.01 * sin((uv.y + uTime * 0.06) * 6.2831);
  col *= 0.99 + 0.01 * sin(uTime * 60.0);

  // --- glass ----------------------------------------------------------------
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  // Reflections lose to emitted light, so they only show on the dark parts.
  float room = 1.0 - smoothstep(0.06, 0.55, lum);

  vec2 g = vec2(c.x * aspect, c.y);
  // A window-shaped highlight up and to the left plus a narrow diagonal streak.
  // Tight shapes read as a reflection; anything broad reads as fog on the
  // glass, which is the failure mode this effect falls into.
  vec2 toBlob = g - vec2(-0.46, -0.27);
  float blob = exp(-dot(toBlob, toBlob) * 16.0);
  float streak = exp(-pow((g.x * 0.5 + g.y + 0.34) * 5.5, 2.0));
  float sheen = blob * 0.075 + streak * 0.03;
  col += vec3(0.62, 0.78, 1.0) * sheen * room * uGlare;

  // Thin lit rim where the glass turns away from the room.
  float rim = smoothstep(0.0, 0.5, 1.0 - edge) * smoothstep(1.0, 0.55, 1.0 - edge);
  col += vec3(0.45, 0.62, 0.9) * rim * 0.16 * uGlare;

  // The tube darkens into its own edge before the bezel takes over.
  col *= mix(0.62, 1.0, edge);

  // Vignette.
  col *= clamp(1.0 - dot(c, c) * uVignette, 0.0, 1.0);

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
    const crt = CONFIG.crt;
    const dt = this.game.loop.delta / 1000;
    this.elapsed += dt;
    this.boost = Math.max(0, this.boost - CONFIG.juice.glowPulseDecayPerSecond * dt * this.boost);
    if (this.boost < 0.002) this.boost = 0;

    this.set1f('uTime', this.elapsed);
    this.set1f('uGlow', crt.glowBase + this.boost);
    this.set1f('uThreshold', crt.bloomThreshold);
    this.set1f('uCurvature', crt.curvature);
    this.set1f('uCornerRadius', crt.cornerRadius);
    this.set1f('uMask', crt.maskStrength);
    this.set1f('uScanline', crt.scanlineDepth);
    this.set1f('uGlare', crt.glareStrength);
    this.set1f('uAberration', crt.aberration);
    this.set1f('uVignette', crt.vignette);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}
