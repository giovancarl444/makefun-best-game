/**
 * Periapsis — repository entrypoint.
 *
 * Checks the game files, copies game/ and screenshots/ into the output directory
 * and writes dossier.json with the vendored make.fun library. Node 22.18+, no deps.
 * Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
 *   MAKEFUN_OUTPUT_DIR=out node main.ts
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const problems = ['game/index.html', 'game/game.js', 'game/style.css'].flatMap((rel) => {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [`MISSING  ${rel}`];
  const info = statSync(abs);
  return info.isFile() && info.size > 0 ? [] : [`EMPTY    ${rel}`];
});
if (problems.length > 0) {
  console.error('periapsis · build check failed — nothing copied');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

// Every regular file under dir, as a path from it, in code-unit order.
const filesUnder = (dir: string): { path: string; bytes: number }[] => {
  const files: { path: string; bytes: number }[] = [];
  const walk = (sub: string): void => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const rel = sub === '' ? entry.name : `${sub}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) files.push({ path: rel, bytes: statSync(join(dir, rel)).size });
    }
  };
  walk('');
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
};

mkdirSync(out, { recursive: true });
cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });

for (const kind of ['game', 'screenshots']) {
  for (const file of filesUnder(join(out, kind))) {
    console.log(`copied   ${`${kind}/${file.path}`.padEnd(32)} ${String(file.bytes).padStart(8)} bytes`);
  }
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`wrote    ${'dossier.json'.padEnd(32)} ${String(dossier.byteLength).padStart(8)} bytes`);
console.log('ok');
