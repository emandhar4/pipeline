// Fails (exit 1) if any file under .next/static contains the literal value of
// SUPABASE_SECRET_KEY (when set) or the string "SUPABASE_SECRET_KEY".
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = '.next/static';
if (!existsSync(root)) {
  console.error(`check-bundle-secrets: ${root} not found; run \`npm run build\` first.`);
  process.exit(1);
}

const needles = ['SUPABASE_SECRET_KEY'];
const secret = process.env.SUPABASE_SECRET_KEY;
if (secret) needles.push(secret);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let scanned = 0;
const leaks = [];
for (const file of walk(root)) {
  scanned++;
  const content = readFileSync(file, 'latin1');
  for (const needle of needles) {
    if (content.includes(needle)) {
      // Never print the secret value itself.
      leaks.push(`${file} (${needle === 'SUPABASE_SECRET_KEY' ? 'name' : 'value'})`);
    }
  }
}

if (leaks.length > 0) {
  console.error('check-bundle-secrets: secret leaked into the client bundle:');
  for (const leak of leaks) console.error(`  ${leak}`);
  process.exit(1);
}
console.log(`check-bundle-secrets: ok (${scanned} files scanned)`);
