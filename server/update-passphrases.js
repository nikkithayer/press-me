/**
 * One-off: assign new single-word passphrases.
 * Admins: David Daw → raven, Nikki Thayer → velvet
 * Others: distinct words from POOL (stable order by user id).
 *
 * Usage:
 *   cd server && node update-passphrases.js           # dry-run
 *   cd server && node update-passphrases.js --apply   # execute
 */
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing POSTGRES_URL or DATABASE_URL');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

/** Spelling-friendly pool (raven / velvet reserved for named admins). */
const POOL = [
  'ivory',
  'amber',
  'garnet',
  'emerald',
  'ruby',
  'sapphire',
  'scarlet',
  'crimson',
  'silver',
  'cardinal',
  'juniper',
  'cedar',
  'violet',
  'jasmine',
  'lily',
  'marigold',
  'ivy',
  'midnight',
  'thunder',
  'frost',
  'shadow',
  'mist',
  'lantern',
  'beacon',
  'compass',
  'harbor',
  'bronze',
  'copper',
  'coral',
  'topaz',
  'opal',
  'maple',
  'willow',
  'laurel',
];

function norm(s) {
  return (s || '').trim().toLowerCase();
}

function passphraseForNamedAdmin(row) {
  const fn = norm(row.firstname);
  const ln = norm(row.lastname);
  if (fn === 'david' && ln === 'daw') return 'raven';
  if (fn === 'nikki' && ln === 'thayer') return 'velvet';
  return null;
}

async function main() {
  const users = await sql`
    SELECT id, firstname, lastname, is_admin, passphrase
    FROM users
    ORDER BY id
  `;

  if (users.length === 0) {
    console.error('No users found in database.');
    process.exit(1);
  }

  const assignments = [];
  const poolQueue = [...POOL];

  for (const row of users) {
    const specific = passphraseForNamedAdmin(row);
    if (specific) {
      assignments.push({ id: row.id, passphrase: specific, note: 'named-admin' });
      continue;
    }
    const word = poolQueue.shift();
    if (!word) {
      console.error(
        `Not enough pool words for user id=${row.id} (${row.firstname} ${row.lastname}). Extend POOL.`,
      );
      process.exit(1);
    }
    assignments.push({ id: row.id, passphrase: word, note: 'pool' });
  }

  const seen = new Set();
  for (const a of assignments) {
    if (seen.has(a.passphrase)) {
      console.error(`Duplicate passphrase in assignment: ${a.passphrase}`);
      process.exit(1);
    }
    seen.add(a.passphrase);
  }

  const rowsThatWillChange = assignments.filter((a) => {
    const before = users.find((u) => u.id === a.id)?.passphrase;
    return before !== a.passphrase;
  });

  console.log(`Users in DB: ${users.length}`);
  console.log(`Passphrase values that differ from target (will update): ${rowsThatWillChange.length}`);

  for (const a of rowsThatWillChange) {
    const row = users.find((u) => u.id === a.id);
    const before = row?.passphrase ?? '(null)';
    console.log(`  id=${a.id} [${a.note}] ${row?.firstname} ${row?.lastname}: "${before}" -> "${a.passphrase}"`);
  }

  const APPLY = process.argv.includes('--apply');
  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to execute in one transaction.');
    process.exit(0);
  }

  const queries = assignments.map(
    (a) => sql`UPDATE users SET passphrase = ${a.passphrase} WHERE id = ${a.id}`,
  );

  await sql.transaction(queries);

  const verify = await sql`
    SELECT id, passphrase FROM users ORDER BY id
  `;
  for (const a of assignments) {
    const v = verify.find((r) => r.id === a.id);
    if (!v || v.passphrase !== a.passphrase) {
      console.error(`Verification failed for user id=${a.id}`);
      process.exit(1);
    }
  }

  console.log('\nTransaction committed successfully.');
  console.log(`UPDATE statements run: ${assignments.length}`);
  console.log(`Records whose passphrase value changed (before vs after this migration): ${rowsThatWillChange.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
