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

async function setupNeonDatabase() {
  try {
    console.log('Setting up Neon database (non-destructive)...');
    console.log('Connected to Neon database');

    console.log('Creating tables if not present...');

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        firstname VARCHAR(50) NOT NULL,
        lastname VARCHAR(50) NOT NULL,
        ishere BOOLEAN DEFAULT true,
        alias_1 VARCHAR(50) NOT NULL,
        alias_2 VARCHAR(50) NOT NULL,
        passphrase TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        agent_name VARCHAR(50) NOT NULL,
        success BOOLEAN NOT NULL,
        ip_address INET,
        user_agent TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        participant_user_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        started_at TIMESTAMP,
        paused_at TIMESTAMP,
        ended_at TIMESTAMP,
        notes TEXT,
        current_phase INTEGER DEFAULT 0,
        CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'paused', 'ended'))
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS phase_missions (
        id SERIAL PRIMARY KEY,
        phase INTEGER NOT NULL CHECK (phase IN (1, 2, 3)),
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

    await sql`
      CREATE TABLE IF NOT EXISTS player_missions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        mission_id INTEGER NOT NULL REFERENCES phase_missions(id),
        variable_value TEXT,
        completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP,
        signed_off_by INTEGER REFERENCES users(id),
        signed_off_at TIMESTAMP,
        phrase_answer TEXT,
        bounty_paid BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(session_id, user_id, mission_id)
      )
    `;

    console.log('✓ Tables verified');

    // Ensure expected columns exist (safe no-ops for existing columns)
    console.log('Ensuring all columns exist...');

    // users
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS firstname VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS lastname VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ishere BOOLEAN DEFAULT true`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS alias_1 VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS alias_2 VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS passphrase TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`;

    // login_logs
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS agent_name VARCHAR(50)`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS success BOOLEAN`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS ip_address INET`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS user_agent TEXT`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP DEFAULT NOW()`;

    // sessions
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS name VARCHAR(100)`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participant_user_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[]`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by INTEGER`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes TEXT`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_phase INTEGER DEFAULT 0`;

    // phase_missions
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

    // player_missions
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS session_id INTEGER`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS user_id INTEGER`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS mission_id INTEGER`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS variable_value TEXT`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS signed_off_by INTEGER`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS signed_off_at TIMESTAMP`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS phrase_answer TEXT`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS bounty_paid BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE player_missions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`;

    console.log('✓ Schema up to date');

    // Indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_users_alias_1 ON users(alias_1)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_alias_2 ON users(alias_2)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_ishere ON users(ishere)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON login_logs(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_login_logs_agent_name ON login_logs(agent_name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(status) WHERE status = 'active'`;
    await sql`CREATE INDEX IF NOT EXISTS idx_phase_missions_phase ON phase_missions(phase)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_session ON player_missions(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_user ON player_missions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_mission ON player_missions(mission_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_signoff ON player_missions(signed_off_by)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_lookup ON player_missions(session_id, user_id, completed)`;

    console.log('✓ Indexes verified');
    console.log('\n✓ Database setup completed successfully!');

  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  }
}

setupNeonDatabase();
