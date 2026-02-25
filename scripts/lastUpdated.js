/**
 * scripts/lastUpdated.js
 * Writes the last git commit date to public/lastUpdated.json.
 * Run automatically via npm prebuild / predev hooks.
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const outDir    = join(root, 'public');
const outFile   = join(outDir, 'lastUpdated.json');

try {
  const iso = execSync('git log -1 --format=%cI', { cwd: root }).toString().trim();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify({ date: iso }));
  console.log('[lastUpdated] Written:', iso);
} catch (e) {
  console.warn('[lastUpdated] Could not read git log — skipping.', e.message);
}
