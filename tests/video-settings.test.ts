import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  defaultVideoSettings,
  isDefaultVideo,
  MAX_CURVATURE,
  sanitizeVideoSettings,
  scaleCrt,
  VIDEO_KNOBS,
  VIDEO_MAX,
  VIDEO_MIN,
} from '../src/core/settings/video';

describe('defaults', () => {
  it('ships every knob at 1, so 1 means "as designed"', () => {
    const settings = defaultVideoSettings();
    for (const knob of VIDEO_KNOBS) expect(settings[knob.id]).toBe(1);
  });

  it('leaves the configured look untouched at default', () => {
    expect(scaleCrt(CONFIG.crt, defaultVideoSettings())).toEqual(CONFIG.crt);
  });

  it('recognises an untouched settings block', () => {
    expect(isDefaultVideo(defaultVideoSettings())).toBe(true);
    expect(isDefaultVideo({ ...defaultVideoSettings(), scanlines: 0.4 })).toBe(false);
  });
});

describe('scaleCrt', () => {
  it('turns an effect fully off at zero', () => {
    const crt = scaleCrt(CONFIG.crt, { ...defaultVideoSettings(), scanlines: 0, mask: 0 });
    expect(crt.scanlineDepth).toBe(0);
    expect(crt.maskStrength).toBe(0);
    // Untouched knobs are unaffected by their neighbours.
    expect(crt.vignette).toBe(CONFIG.crt.vignette);
  });

  it('doubles an effect at the top of the range', () => {
    const crt = scaleCrt(CONFIG.crt, { ...defaultVideoSettings(), scanlines: VIDEO_MAX });
    expect(crt.scanlineDepth).toBeCloseTo(CONFIG.crt.scanlineDepth * 2, 6);
  });

  it('drops the bloom threshold as bloom climbs, so mid-tones glow too', () => {
    const base = scaleCrt(CONFIG.crt, defaultVideoSettings());
    const loud = scaleCrt(CONFIG.crt, { ...defaultVideoSettings(), bloom: 2 });
    expect(loud.glowBase).toBeGreaterThan(base.glowBase);
    expect(loud.bloomThreshold).toBeLessThan(base.bloomThreshold);
  });

  it('never divides by a bloom dial at zero', () => {
    const off = scaleCrt(CONFIG.crt, { ...defaultVideoSettings(), bloom: 0 });
    expect(off.glowBase).toBe(0);
    expect(Number.isFinite(off.bloomThreshold)).toBe(true);
  });

  it('caps curvature so the HUD cannot be pushed under the bezel', () => {
    const bent = scaleCrt(CONFIG.crt, { ...defaultVideoSettings(), curvature: VIDEO_MAX });
    expect(bent.curvature).toBeLessThanOrEqual(MAX_CURVATURE);
  });
});

describe('sanitizeVideoSettings', () => {
  it('falls back on garbage', () => {
    expect(sanitizeVideoSettings(null)).toEqual(defaultVideoSettings());
    expect(sanitizeVideoSettings('scanlines')).toEqual(defaultVideoSettings());
    expect(sanitizeVideoSettings(undefined)).toEqual(defaultVideoSettings());
  });

  it('keeps valid knobs and repairs the rest', () => {
    const settings = sanitizeVideoSettings({
      scanlines: 0.3,
      bloom: -5,
      mask: 12,
      glare: Number.NaN,
      unknown: 7,
    });
    expect(settings.scanlines).toBe(0.3);
    expect(settings.bloom).toBe(VIDEO_MIN);
    expect(settings.mask).toBe(VIDEO_MAX);
    expect(settings.glare).toBe(1);
    expect(settings.shake).toBe(1);
    expect('unknown' in settings).toBe(false);
  });
});
