/**
 * Reconcile the sample table against the files on disk.
 *
 * `AudioManager` is built to tolerate missing samples: anything absent falls
 * back to synthesis, so the game runs with `public/sfx/` empty. That tolerance
 * is the right design and it has one cost — a filename that is absent because
 * nobody has recorded it yet and a filename that is absent because it was
 * typed wrong look identical from inside the game. Both are silence where a
 * sample should be, and neither says anything.
 *
 * So this says it instead. A required file that is missing is an error. An
 * optional take that is missing is upside not yet claimed, and is listed as
 * such. A file sitting in the folder that nothing references is almost always
 * a misspelling — that one is an error too, because it is the case where
 * somebody did the work and the game silently ignored it.
 *
 *   npm run audio
 *
 * Reads three sources and trusts each for one thing: the table in
 * AudioManager.ts for what the game asks for, README.md for what is optional,
 * and the folders for what exists.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(ROOT, 'src/audio/AudioManager.ts');
const README = resolve(ROOT, 'public/sfx/README.md');
const FOLDERS = ['sfx', 'music'];

/**
 * Every path the audio table asks for.
 *
 * Read out of the source rather than imported: AudioManager pulls in Phaser and
 * a live AudioContext, neither of which exists in node. A regex over a table of
 * string literals is enough, and the sanity floor below turns a refactor that
 * moves those literals into a loud failure rather than a quiet all-clear.
 */
function referencedPaths() {
  const src = readFileSync(SOURCE, 'utf8');
  const found = new Set(
    [...src.matchAll(/'((?:sfx|music)\/[A-Za-z0-9_-]+\.mp3)'/g)].map((m) => m[1]),
  );
  if (found.size < 10) {
    throw new Error(
      `Only ${found.size} audio paths found in AudioManager.ts — the table has probably moved. ` +
        'Fix the pattern in scripts/audio-check.mjs rather than trusting this result.',
    );
  }
  return found;
}

/** Filenames the README table marks *(optional)*. */
function optionalNames() {
  if (!existsSync(README)) return new Set();
  const text = readFileSync(README, 'utf8');
  return new Set(
    [...text.matchAll(/^\|\s*`([^`]+\.mp3)`\s*\|[^|]*\*\(optional\)\*/gm)].map((m) => m[1]),
  );
}

function presentPaths() {
  const present = new Set();
  for (const folder of FOLDERS) {
    const dir = resolve(ROOT, 'public', folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.mp3')) present.add(`${folder}/${name}`);
    }
  }
  return present;
}

/**
 * Layers whose alternate takes have not all arrived.
 *
 * The README calls random alternate takes "the single biggest defence against
 * the machine-gun effect", so a layer down to one loaded take will repeat
 * identically however often it fires. That is not an error — it is the most
 * useful thing this script can tell anyone deciding what to record next.
 */
function thinLayers(referenced, present) {
  const groups = new Map();
  for (const path of referenced) {
    // gun_fraction_a -> gun_fraction; anything without a take suffix is its own group.
    const match = /^(.*)_([a-z])\.mp3$/.exec(path);
    if (!match) continue;
    const stem = match[1];
    const group = groups.get(stem) ?? { declared: 0, loaded: 0 };
    group.declared += 1;
    if (present.has(path)) group.loaded += 1;
    groups.set(stem, group);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.declared > 1 && g.loaded < g.declared)
    .map(([stem, g]) => ({ stem, ...g }));
}

const referenced = referencedPaths();
const present = presentPaths();
const optional = optionalNames();

const missing = [...referenced].filter((p) => !present.has(p)).sort();
const missingRequired = missing.filter((p) => !optional.has(p.split('/')[1]));
const missingOptional = missing.filter((p) => optional.has(p.split('/')[1]));
const orphans = [...present].filter((p) => !referenced.has(p)).sort();

console.log(`referenced ${referenced.size}  ·  present ${present.size}\n`);

if (missingRequired.length > 0) {
  console.log('MISSING — required, the effect falls back to synthesis:');
  for (const p of missingRequired) console.log(`  ${p}`);
  console.log('');
}

if (orphans.length > 0) {
  console.log('ORPHANED — in the folder but nothing plays it. Check the spelling:');
  for (const p of orphans) console.log(`  ${p}`);
  console.log('');
}

if (missingOptional.length > 0) {
  console.log('UNCLAIMED — optional alternate takes, prompts in public/sfx/PROMPTS.md:');
  for (const p of missingOptional) console.log(`  ${p}`);
  console.log('');
}

const thin = thinLayers(referenced, present);
if (thin.length > 0) {
  console.log('REPEATS — one take loaded, so these sound identical every time:');
  for (const t of thin) console.log(`  ${t.stem}  ${t.loaded}/${t.declared} takes`);
  console.log('');
}

const failures = missingRequired.length + orphans.length;
if (failures > 0) {
  console.error(`${failures} problem${failures === 1 ? '' : 's'}. Optional takes are not counted.`);
  process.exit(1);
}
console.log('All required samples present, nothing orphaned.');
