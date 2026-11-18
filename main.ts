/**
 * Periapsis — repository entrypoint.
 *
 * Verifies the game files, prints their sizes, and copies the game/ directory
 * into out/ so the result can be served statically.
 *
 * Runs directly on Node 22.18+ (native TypeScript type stripping).
 * No dependencies.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const gameDir = join(root, 'game');
const outDir = join(root, 'out');

const required = [
  'game/index.html',
  'game/game.js',
  'game/style.css',
];

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

let failed = false;

console.log('periapsis · build check');
console.log('----------------------------------------');

for (const rel of required) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    console.error(`MISSING  ${rel}`);
    failed = true;
    continue;
  }
  const info = statSync(abs);
  if (!info.isFile() || info.size === 0) {
    console.error(`EMPTY    ${rel}`);
    failed = true;
    continue;
  }
  console.log(`OK       ${rel.padEnd(16)} ${String(info.size).padStart(7)} bytes  (${humanSize(info.size)})`);
}

// Cheap structural checks: the HTML must reference the script and stylesheet,
// and the script must be a classic script (file:// safe, no ES module).
if (!failed) {
  const html = readFileSync(join(gameDir, 'index.html'), 'utf8');
  const js = readFileSync(join(gameDir, 'game.js'), 'utf8');
  if (!html.includes('game.js')) {
    console.error('INVALID  game/index.html does not load game.js');
    failed = true;
  }
  if (!html.includes('style.css')) {
    console.error('INVALID  game/index.html does not load style.css');
    failed = true;
  }
  if (/<script[^>]+type\s*=\s*["']module["']/i.test(html)) {
    console.error('INVALID  game/index.html uses an ES module (file:// would break)');
    failed = true;
  }
  if (!js.trimStart().startsWith('/*') && !js.trimStart().startsWith('(function')) {
    console.error('INVALID  game/game.js has an unexpected header');
    failed = true;
  }
}

if (failed) {
  console.error('----------------------------------------');
  console.error('Build check failed. Nothing copied.');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(gameDir, outDir, { recursive: true });

console.log('----------------------------------------');
console.log(`copied   game/ -> out/ (${relative(root, outDir)}/)`);
const outIndex = statSync(join(outDir, 'index.html'));
console.log(`ready    out/index.html (${outIndex.size} bytes) — open it directly or serve out/`);
console.log('ok');
