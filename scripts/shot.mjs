/**
 * Scene screenshots, for looking at the game without playing it.
 *
 * The hangar shipped with every selection frame in the wrong place, and it took
 * a human loading the page to notice. Layout has no test surface: the maths is
 * covered to death in `tests/`, but nothing watches where a box lands. This is
 * that missing pair of eyes.
 *
 *   npm run shot -- Shop --kind=hull
 *   npm run shot -- Menu --out menu.png
 *   npm run shot -- all
 *
 * It drives the real thing: a real Vite dev server, real Chromium, real WebGL,
 * so the CRT pipeline and font metrics are the ones players get. `Phaser.HEADLESS`
 * would be lighter and is the obvious reach, but it is a *no-render* mode — it
 * has no renderer to read pixels out of — and Phaser under jsdom falls back to
 * CANVAS, which skips the CRT pass and measures text differently. Neither would
 * have caught the hangar bug.
 *
 * Nothing here needs a hook in the game: `window.__game` is already exposed in
 * dev, and the SaveManager is already in the Phaser registry, so a fixture is a
 * mutation on a live object rather than a fake save file to keep in sync.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'shots');
const GOLDEN_DIR = resolve(OUT_DIR, 'golden');

const digest = (file) => createHash('md5').update(readFileSync(file)).digest('hex');

/** Chromium, in order of preference. Never downloads: this must work offline. */
function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `No Chromium found. Set CHROME_PATH, or install one. Tried:\n  ${candidates.join('\n  ')}`,
    );
  }
  return found;
}

/**
 * Scenes worth a routine look, with whatever each needs to stand up alone.
 * Play scenes are absent on purpose — they need a live session, and a frame of
 * one mid-flight says little anyway.
 */
const PRESETS = [
  { name: 'Menu', scene: 'Menu' },
  { name: 'ModeSelect', scene: 'ModeSelect' },
  { name: 'Shop-hull', scene: 'Shop', data: { kind: 'hull' } },
  { name: 'Shop-trail', scene: 'Shop', data: { kind: 'trail' } },
  { name: 'Shop-cannon', scene: 'Shop', data: { kind: 'cannon' } },
  { name: 'Shop-burst', scene: 'Shop', data: { kind: 'burst' } },
  { name: 'Shop-badge', scene: 'Shop', data: { kind: 'badge' } },
  { name: 'Leaderboard', scene: 'Leaderboard' },
  { name: 'Playbook', scene: 'Playbook' },
  { name: 'BrainScan', scene: 'BrainScan' },
  { name: 'Settings', scene: 'Settings' },
  { name: 'Controls', scene: 'Controls' },
  { name: 'Video', scene: 'Video' },
];

/** Enough credits and history that shelves and boards are not all empty. */
const DEFAULT_SAVE = { credits: 9999, bestScore: 42000, totalWaves: 120, placementDone: true };

function parseArgs(argv) {
  const positional = [];
  const opts = { data: {}, save: {}, settle: 900, freeze: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey;
    const value = inlineValue ?? (argv[i + 1]?.startsWith('--') ? undefined : argv[++i]);
    switch (key) {
      case 'out':
        opts.out = value;
        break;
      case 'settle':
        opts.settle = Number(value);
        break;
      case 'no-freeze':
        opts.freeze = false;
        break;
      case 'golden':
        opts.golden = true;
        break;
      case 'check':
        opts.check = true;
        break;
      case 'data':
        Object.assign(opts.data, JSON.parse(value));
        break;
      case 'save':
        Object.assign(opts.save, JSON.parse(value));
        break;
      default:
        // Anything else is scene data shorthand: --kind=hull
        opts.data[key] = value === undefined ? true : value;
    }
  }
  return { target: positional[0], opts };
}

/**
 * Work out which scene to shoot, and what to call the file.
 *
 * The name has to follow the data, not the preset it matched. `Shop --kind=trail`
 * matches the first preset whose scene is `Shop` — which is `Shop-hull` — and
 * naming the file after that would quietly overwrite the hull shot and leave
 * `Shop-trail.png` stale. Reading a stale shot back as proof is the one failure
 * this tool exists to prevent, so an explicit override always renames.
 */
function resolveOne(target, opts) {
  const preset =
    PRESETS.find((p) => p.name === target) ??
    PRESETS.find((p) => p.scene === target) ?? { name: target, scene: target };
  const overrides = Object.values(opts.data);
  return {
    scene: preset.scene,
    name: overrides.length ? [preset.scene, ...overrides].join('-') : preset.name,
    data: { ...preset.data, ...opts.data },
  };
}

/**
 * Boot the game, install a fixture, run one scene, and read the canvas back.
 * Reused across every shot in a batch so one browser serves the whole sweep.
 */
async function shoot(page, { name, scene, data }, opts) {
  const settings = { ...DEFAULT_SAVE, ...opts.save };

  await page.evaluate(
    async ([sceneKey, sceneData, saveOverrides, freeze]) => {
      const game = window.__game;
      // The SaveManager the scenes read is a live object in the registry, so a
      // fixture is an assignment — no save file to write or schema to mirror.
      const saves = game.registry.get('saveManager');
      Object.assign(saves.save, saveOverrides);

      // Stop whatever is currently up, or two scenes render over each other.
      for (const active of game.scene.getScenes(true)) {
        if (active.scene.key !== sceneKey) game.scene.stop(active.scene.key);
      }
      game.scene.start(sceneKey, sceneData);

      await new Promise((done) => {
        const target = game.scene.getScene(sceneKey);
        if (target.sys.settings.status === 5) done();
        else target.events.once('create', done);
      });

      if (freeze) {
        // Two things make the same screen render differently twice, and a shot
        // that is not reproducible cannot be compared to a stored one.
        const target = game.scene.getScene(sceneKey);

        // Tween phase depends on wall-clock. Pausing before the settle wait
        // leaves every tween at its opening value.
        target.tweens.pauseAll();

        // The CRT shader accumulates real elapsed time and drives a 60Hz mains
        // flicker off it, so consecutive frames are never equal. Pinning
        // `elapsed` behind a constant getter makes uTime time-invariant — the
        // pipeline's own `elapsed += dt` becomes a no-op write. applyCrt() builds
        // a fresh instance per scene, so this has to happen after create.
        const found = target.cameras.main.getPostPipeline('CrtPipeline');
        for (const pipe of Array.isArray(found) ? found : [found]) {
          if (!pipe) continue;
          Object.defineProperty(pipe, 'elapsed', { get: () => 12, set: () => {}, configurable: true });
          Object.defineProperty(pipe, 'boost', { get: () => 0, set: () => {}, configurable: true });
        }
      }
    },
    [scene, data ?? {}, settings, opts.freeze],
  );

  await page.waitForTimeout(opts.settle);

  const dir = opts.golden ? GOLDEN_DIR : OUT_DIR;
  const file = resolve(dir, opts.out ?? `${name}.png`);
  mkdirSync(dirname(file), { recursive: true });
  await page.locator('canvas').screenshot({ path: file });
  return file;
}

/**
 * Compare a fresh shot against the stored one. A byte compare is only honest
 * because `--freeze` pins the two things that drift — tween phase and the CRT's
 * elapsed clock — so an identical screen really does produce identical bytes.
 */
function checkAgainstGolden(name, file) {
  const golden = resolve(GOLDEN_DIR, `${name}.png`);
  if (!existsSync(golden)) return { name, status: 'missing' };
  return { name, status: digest(file) === digest(golden) ? 'match' : 'CHANGED' };
}

async function main() {
  const { target, opts } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error(
      'Usage: npm run shot -- <Scene|all> [--kind=hull] [--out f.png] [--settle ms] [--no-freeze]\n' +
        `Presets: ${PRESETS.map((p) => p.scene).join(', ')}`,
    );
    process.exit(1);
  }

  const batch = target === 'all' ? PRESETS : [resolveOne(target, opts)];

  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0 } });
  await server.listen();
  const base = server.resolvedUrls.local[0];

  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: [
      // Headless Chromium has no GPU, and Phaser prefers WebGL — SwiftShader
      // gives a software one so the CRT pipeline still runs rather than the
      // renderer silently falling back to CANVAS.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    // Procedural art and star fields run off Math.random. Pinning it means two
    // shots of an untouched screen are the same picture.
    await page.addInitScript(() => {
      let seed = 0x2f6e2b1;
      Math.random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
    });

    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.isBooted === true, { timeout: 20000 });

    const results = [];
    for (const preset of batch) {
      const file = await shoot(page, preset, opts);
      if (opts.check) {
        const result = checkAgainstGolden(preset.name, file);
        results.push(result);
        console.log(`  ${result.status.padEnd(8)} ${preset.name}`);
      } else {
        console.log(`  ${preset.scene.padEnd(14)} → ${file.replace(`${ROOT}/`, '')}`);
      }
    }

    if (opts.check) {
      const bad = results.filter((r) => r.status !== 'match');
      if (bad.length) {
        console.error(
          `\n${bad.length} of ${results.length} differ from shots/golden/.\n` +
            'Look at the new shots, then re-bless with: npm run shot -- all --golden',
        );
        process.exitCode = 1;
      } else {
        console.log(`\nAll ${results.length} match shots/golden/.`);
      }
    }

    if (errors.length) {
      console.error(`\nPage errors during capture:\n  ${errors.join('\n  ')}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
