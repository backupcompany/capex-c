/**
 * ponytail: assert same-HU filter is present in project duplicate search.
 * Run: node --experimental-strip-types capexbe/src/duplicate-detection/duplicate-detection.hu-filter.selfcheck.mjs
 * (or: node -e with fs read — plain mjs below)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'duplicate-detection.search.ts'),
  'utf8',
);
const fnStart = src.indexOf('export async function searchDuplicateProjects');
const fnEnd = src.indexOf('export async function searchDuplicateAssets');
const body = src.slice(fnStart, fnEnd);
if (!body.includes("eq('hospital_unit_id', opts.huId)")) {
  console.error('FAIL: searchDuplicateProjects must filter by hospital_unit_id when huId set');
  process.exit(1);
}
if (body.includes('matchScore += 5')) {
  console.error('FAIL: same-HU score boost must not replace hard filter');
  process.exit(1);
}
console.log('OK duplicate project search filters by hospital_unit_id');
