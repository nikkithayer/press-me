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
  console.error('Missing database URL. Set POSTGRES_URL or DATABASE_URL in your .env');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function setupPhaseMissions() {
  try {
    console.log('Setting up phase_missions table (non-destructive)...');

    // Create table if it doesn't exist (global — no session_id)
    await sql`
      CREATE TABLE IF NOT EXISTS phase_missions (
        id SERIAL PRIMARY KEY,
        phase INTEGER NOT NULL,
        title TEXT NOT NULL,
        mission_body TEXT NOT NULL,
        completion_type VARCHAR(10) NOT NULL CHECK (completion_type IN ('phrase', 'signoff')),
        success_key TEXT,
        signoff_prompt_template TEXT,
        variable_pool JSONB,
        variable_source VARCHAR(20) DEFAULT 'pool',
        signer_constraint VARCHAR(20) CHECK (signer_constraint IN ('any', 'new_signer', 'same_signer', 'admin_only')),
        same_signer_mission_id INTEGER REFERENCES phase_missions(id),
        sort_order INTEGER NOT NULL DEFAULT 0,
        bounty INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Ensure all columns exist
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS phase INTEGER`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS title TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS mission_body TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS completion_type VARCHAR(10)`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS success_key TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS signoff_prompt_template TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS variable_pool JSONB`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS variable_source VARCHAR(20) DEFAULT 'pool'`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS signer_constraint VARCHAR(20)`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS same_signer_mission_id INTEGER`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS bounty INTEGER DEFAULT 0`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`;

    // Remove session_id if it exists (missions are now global, not per-session)
    await sql`ALTER TABLE phase_missions DROP COLUMN IF EXISTS session_id`;

    // Widen phase constraint to allow phase 0
    await sql`ALTER TABLE phase_missions DROP CONSTRAINT IF EXISTS phase_missions_phase_check`;
    await sql`ALTER TABLE phase_missions ADD CONSTRAINT phase_missions_phase_check CHECK (phase IN (0, 1, 2, 3))`;

    // Widen signer_constraint to include admin_only
    await sql`ALTER TABLE phase_missions DROP CONSTRAINT IF EXISTS phase_missions_signer_constraint_check`;
    await sql`ALTER TABLE phase_missions ADD CONSTRAINT phase_missions_signer_constraint_check CHECK (signer_constraint IN ('any', 'new_signer', 'same_signer', 'admin_only'))`;

    console.log('✓ Table schema up to date');

    // Clear old data and reseed
    const existing = await sql`SELECT count(*) as cnt FROM phase_missions`;
    if (existing[0].cnt > 0) {
      console.log(`  Found ${existing[0].cnt} existing rows — clearing for reseed`);
      await sql`DELETE FROM player_missions WHERE mission_id IN (SELECT id FROM phase_missions)`;
      await sql`DELETE FROM phase_missions`;
      await sql`ALTER SEQUENCE phase_missions_id_seq RESTART WITH 1`;
    }

    console.log('Seeding phase missions...');

    // ── Phase 0: Icebreaker ──
    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (0, 'Introduction I', 'Introduce yourself to someone and learn their real name. Get them to sign off with their passphrase.', 'signoff', 'I met {player_name} and we introduced ourselves.', 'new_signer', 1, 0)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (0, 'Introduction II', 'Introduce yourself to someone new and learn their real name. Get them to sign off with their passphrase.', 'signoff', 'I met {player_name} and we introduced ourselves.', 'new_signer', 2, 0)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (0, 'Introduction III', 'Introduce yourself to a third person and learn their real name. Get them to sign off with their passphrase.', 'signoff', 'I met {player_name} and we introduced ourselves.', 'new_signer', 3, 0)`;

    // ── Phase 1 (Act I) ──
    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (1, 'Operation Live to Serve', 'Dress up in the waiter uniform and serve another guest food and/or drink. Get them to confirm the service.', 'signoff', '{player_name} served me food and/or drink while dressed as a waiter.', 'any', 1, 200)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (1, 'Operation House Always Wins', 'Put on a disguise and run the gambling table until you get a tip from another guest.', 'signoff', 'I tipped {player_name} while they were running the gambling table.', 'any', 2, 100)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (1, 'Operation Thin Blue Liar', 'Get the police badge and interrogate your hosts for information on the secret discovery.', 'signoff', '{player_name} interrogated me while wearing a police badge.', 'any', 3, 300)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (1, 'Operation MLM', 'Disguise yourself as a wealthy patron and convince a guest to give at least 500 to our hosts to invest in the toy company.', 'signoff', '{player_name} convinced me to invest in the toy company.', 'any', 4, 300)`;

    const newHire = await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (1, 'Operation New Hire', 'Create a new cover identity with an identifiable profession and convince another guest that you are an upstanding member of that profession.', 'signoff', '{player_name} convinced me they are a professional in their claimed field.', 'any', 5, 250)
      RETURNING id`;

    // ── Phase 2 (Act II) ──
    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (2, 'Operation Lost Shirt', 'Go play at the gambling table and lose at least 500.', 'signoff', '{player_name} lost at least 500 at my gambling table.', 'any', 1, 200)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, variable_source, signer_constraint, sort_order, bounty)
      VALUES (2, 'Operation False Fracas', 'Start a fight with {variable} until one of the hosts comes to check on you.', 'signoff', '{player_name} and I got into a fight and the hosts had to check on us.', 'participants', 'any', 2, 250)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (2, 'Operation Don''t I Know You?', 'Get another guest to give you their autograph and then show it to your hosts.', 'signoff', 'I gave {player_name} my autograph.', 'any', 3, 100)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (2, 'Operation But Is It Art?', 'Wear the beret and convince another guest to buy your "art" for at least 300. Get them to fill out a form confirming the purchase.', 'signoff', 'I purchased art from {player_name} for at least 300.', 'any', 4, 100)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, same_signer_mission_id, sort_order, bounty)
      VALUES (2, 'Operation Prodigal Son', 'Wear a new disguise and convince the same person who signed off on Operation New Hire that you are a long lost relative.', 'signoff', '{player_name} convinced me they are my long lost relative.', 'same_signer', ${newHire[0].id}, 5, 400)`;

    // ── Phase 3 (Act III) ──
    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (3, 'Operation Foreign Investment', 'Don a new disguise and pose as a foreign investor with an outrageous accent. Convince the hosts that they need to act normal for the "foreign investors."', 'signoff', '{player_name} posed as a foreign investor and I played along.', 'any', 1, 500)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (3, 'Operation Stop Where You Are', 'Disguise yourself as the police again and de-escalate the situation with the hosts.', 'signoff', '{player_name} de-escalated the situation while disguised as police.', 'any', 2, 500)`;

    await sql`INSERT INTO phase_missions (phase, title, mission_body, completion_type, signoff_prompt_template, signer_constraint, sort_order, bounty)
      VALUES (3, 'Operation Over There', 'Create a distraction so the current holder of The Technology can hide it or pass it to another guest.', 'signoff', '{player_name} created a distraction that helped me move The Technology.', 'any', 3, 500)`;

    // Verify
    const counts = await sql`SELECT phase, count(*) as cnt FROM phase_missions GROUP BY phase ORDER BY phase`;
    for (const row of counts) {
      console.log(`  Phase ${row.phase}: ${row.cnt} missions`);
    }

    console.log('\n✓ Phase missions seeded successfully');

    // Indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_phase_missions_phase ON phase_missions(phase)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_phase_missions_sort ON phase_missions(phase, sort_order)`;
    console.log('✓ Indexes verified');

  } catch (err) {
    console.error('Error setting up phase missions:', err);
    process.exit(1);
  }
}

setupPhaseMissions();
