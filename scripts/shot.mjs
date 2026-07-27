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
  {
    // A board mid-fill. The empty one above covers the unclaimed rungs; this
    // covers the medal colours and the claimed-above-unclaimed seam, which
    // nothing else looks at.
    name: 'Leaderboard-filled',
    scene: 'Leaderboard',
    data: {
      __board: {
        mode: 'meteor',
        entries: [
          { initials: 'LTB', score: 42000, wave: 14, at: 1 },
          { initials: 'AAA', score: 31500, wave: 11, at: 2 },
          { initials: 'ZZZ', score: 22800, wave: 9, at: 3 },
          { initials: 'QQQ', score: 9100, wave: 5, at: 4 },
        ],
      },
    },
  },
  { name: 'Playbook', scene: 'Playbook' },
  { name: 'BrainScan', scene: 'BrainScan' },
  {
    // A profile mid-climb, so the goldens actually cover the mastery bars. The
    // empty-save shot above is all NO SIGNAL and would not notice them break.
    // One skill per gate: barely started, ground out but slow, and mastered.
    name: 'BrainScan-progress',
    scene: 'BrainScan',
    save: {
      skills: {
        'add.single': { rating: 540, attempts: 3, correct: 3, fluency: 2.1, lastAttemptWave: 5 },
        'add.bridge': { rating: 760, attempts: 220, correct: 200, fluency: 0.7, lastAttemptWave: 5 },
        'add.double': { rating: 900, attempts: 70, correct: 62, fluency: 1.8, lastAttemptWave: 5 },
        'mul.table.7': { rating: 1100, attempts: 130, correct: 118, fluency: 1.7, lastAttemptWave: 5 },
        'mul.table.8': { rating: 700, attempts: 40, correct: 33, fluency: 1.1, lastAttemptWave: 5 },
      },
    },
  },
  { name: 'ExerciseSelect', scene: 'ExerciseSelect' },
  {
    // The one play scene worth a golden: it is all layout, it needs no live
    // session, and it seeds from Math.random — which this harness stubs — so
    // the problem it deals is the same one every time.
    name: 'Exercise',
    scene: 'Exercise',
    data: { skillId: 'add.triple' },
  },
  // One per picture. The dial drives three unrelated renderers — counters in
  // frames, a rectangle, and bars — and a baseline of only the first would let
  // the other two rot unnoticed.
  { name: 'Exercise-sub', scene: 'Exercise', data: { skillId: 'sub.borrow' } },
  { name: 'Exercise-mul', scene: 'Exercise', data: { skillId: 'mul.2x2' } },
  { name: 'Exercise-frac', scene: 'Exercise', data: { skillId: 'frac.add.unlike' } },
  { name: 'Settings', scene: 'Settings' },
  { name: 'Controls', scene: 'Controls' },
  { name: 'Video', scene: 'Video' },
];

/**
 * Enough credits and history that shelves and boards are not all empty.
 *
 * Applied in full before every shot, not just the first: one browser serves the
 * whole batch, so a preset that seeds a skill table would otherwise leave it
 * behind for everything after it and make a shot depend on preset order.
 */
const DEFAULT_SAVE = {
  credits: 9999,
  bestScore: 42000,
  totalWaves: 120,
  placementDone: true,
  skills: {},
  milestones: [],
};

function parseArgs(argv) {
  const positional = [];
  const opts = { data: {}, save: {}, settle: 900, after: 250, freeze: true };
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
      case 'after':
        // Wait after the keys land. A scene that answers a keypress with a
        // delayed transition needs longer than the default to be caught
        // mid-flight, or the shot shows the state before the change.
        opts.after = Number(value);
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
      case 'keys':
        // Keys to press after the scene settles, comma-separated Playwright
        // names ("Tab,ArrowLeft,Enter"). For overlays a scene only shows on
        // input. Key-driven shots are for eyeballing, not goldens: what a
        // keypress does mid-scene is the scene's business, not the harness's.
        opts.keys = value.split(',');
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
    save: preset.save,
  };
}

/**
 * Boot the game, install a fixture, run one scene, and read the canvas back.
 * Reused across every shot in a batch so one browser serves the whole sweep.
 */
async function shoot(page, { name, scene, data, save }, opts) {
  const settings = { ...DEFAULT_SAVE, ...save, ...opts.save };

  await page.evaluate(
    async ([sceneKey, sceneData, saveOverrides, freeze]) => {
      const game = window.__game;
      window.__reseed();
      // The SaveManager the scenes read is a live object in the registry, so a
      // fixture is an assignment — no save file to write or schema to mirror.
      const saves = game.registry.get('saveManager');
      Object.assign(saves.save, saveOverrides);

      if (sceneData.__board) {
        // Seed a partly-filled board so the mixed case — claimed rungs above
        // unclaimed ones — is something a shot can actually show.
        window.localStorage.setItem('mathgame.board.' + sceneData.__board.mode,
          JSON.stringify(sceneData.__board.entries));
      }

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

      if (sceneData.__pad) {
        // The on-screen pads default off on a desktop pointer, so a shot that
        // is meant to show them has to ask.
        const target = game.scene.getScene(sceneKey);
        for (const key of ['pad', 'numpad']) target[key]?.setVisible(true);
      }

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

  if (opts.keys) {
    for (const key of opts.keys) await page.keyboard.press(key);
    await page.waitForTimeout(opts.after);
  }

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
      const SEED = 0x2f6e2b1;
      let seed = SEED;
      Math.random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      // Rewound before every shot. One page serves the whole batch and each
      // scene draws its star field from this one stream, so without a rewind
      // inserting a preset would shift the stars of every scene after it and
      // churn goldens that nothing touched.
      window.__reseed = () => void (seed = SEED);
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
