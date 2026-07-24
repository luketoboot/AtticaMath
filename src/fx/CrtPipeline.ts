import Phaser from 'phaser';

/**
 * CRT post-processing: barrel distortion, scanlines, chromatic aberration,
 * phosphor glow (cheap neighborhood bleed), vignette, subtle flicker.
 */
const FRAG = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 outTexCoord;

vec2 barrel(vec2 uv) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return uv + c * r2 * 0.12;
}

void main() {
  vec2 uv = barrel(outTexCoord);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Chromatic aberration: split channels radially.
  vec2 c = uv - 0.5;
  float aber = 0.0022 * length(c) * 2.0;
  float rC = texture2D(uMainSampler, uv + c * aber).r;
  float gC = texture2D(uMainSampler, uv).g;
  float bC = texture2D(uMainSampler, uv - c * aber).b;
  vec3 col = vec3(rC, gC, bC);

  // Phosphor glow: cheap 4-tap bleed.
  vec2 px = 1.0 / uResolution;
  vec3 glow = texture2D(uMainSampler, uv + vec2(px.x * 2.0, 0.0)).rgb
            + texture2D(uMainSampler, uv - vec2(px.x * 2.0, 0.0)).rgb
            + texture2D(uMainSampler, uv + vec2(0.0, px.y * 2.0)).rgb
            + texture2D(uMainSampler, uv - vec2(0.0, px.y * 2.0)).rgb;
  col += glow * 0.08;

  // Scanlines.
  float scan = 0.88 + 0.12 * sin(uv.y * uResolution.y * 3.14159);
  col *= scan;

  // Slight horizontal mask stripes (aperture grille feel).
  float grille = 0.96 + 0.04 * sin(uv.x * uResolution.x * 3.14159);
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

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAG, name: CrtPipeline.KEY });
  }

  override onPreRender(): void {
    this.elapsed += this.game.loop.delta / 1000;
    this.set1f('uTime', this.elapsed);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}
