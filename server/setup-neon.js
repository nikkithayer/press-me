import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// Neon database connection
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

    // Create tables if they don't exist — no DROP statements
    console.log('Creating tables if not present...');

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        firstname VARCHAR(50) NOT NULL,
        lastname VARCHAR(50) NOT NULL,
        team VARCHAR(4) NOT NULL,
        ishere BOOLEAN DEFAULT true,
        alias_1 VARCHAR(50) NOT NULL,
        alias_2 VARCHAR(50) NOT NULL,
        passphrase TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        score INTEGER DEFAULT 0
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS intel (
        id SERIAL PRIMARY KEY,
        clue_text TEXT NOT NULL,
        agents_who_know INTEGER[]
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS missions (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        mission_body TEXT NOT NULL,
        assigned_agent INTEGER,
        past_assigned_agents INTEGER[],
        assigned_now BOOLEAN DEFAULT FALSE,
        mission_expires TIMESTAMP,
        success_key TEXT,
        type VARCHAR(20)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name VARCHAR(10) UNIQUE NOT NULL,
        points INTEGER DEFAULT 0
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS toys (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        points INTEGER DEFAULT 0
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
      CREATE TABLE IF NOT EXISTS agent_intel (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        alias VARCHAR(50) NOT NULL,
        intel_type VARCHAR(20) NOT NULL,
        intel_value VARCHAR(100) NOT NULL,
        position INTEGER,
        UNIQUE(agent_id, alias, intel_type)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS book_missions (
        id INTEGER PRIMARY KEY,
        book VARCHAR,
        clue_red VARCHAR,
        answer_red VARCHAR,
        clue_blue VARCHAR,
        answer_blue VARCHAR,
        red_completed BOOLEAN NOT NULL DEFAULT false,
        blue_completed BOOLEAN NOT NULL DEFAULT false,
        assigned_red INTEGER,
        assigned_blue INTEGER,
        previous_reds INTEGER[],
        previous_blues INTEGER[]
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS object_missions (
        id INTEGER PRIMARY KEY,
        title VARCHAR,
        mission_body TEXT,
        completed BOOLEAN NOT NULL DEFAULT false,
        assigned_agent INTEGER,
        past_assigned_agents INTEGER[],
        assigned_now BOOLEAN NOT NULL DEFAULT false,
        success_key TEXT
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS passphrase_missions (
        id INTEGER PRIMARY KEY,
        passphrase_template VARCHAR,
        correct_answer VARCHAR,
        incorrect_answer VARCHAR,
        assigned_receiver INTEGER,
        assigned_sender_1 INTEGER,
        assigned_sender_2 INTEGER,
        completed BOOLEAN NOT NULL DEFAULT false,
        previous_receivers INTEGER[],
        previous_senders INTEGER[]
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
        mission_refresh_interval_minutes INTEGER DEFAULT 15,
        voting_open BOOLEAN DEFAULT false,
        CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'paused', 'ended'))
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS assignment_timestamp (
        id INTEGER PRIMARY KEY,
        last_assigned_at TIMESTAMP,
        currently_updating BOOLEAN DEFAULT FALSE
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS phase_missions (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES sessions(id),
        phase INTEGER NOT NULL CHECK (phase IN (1, 2, 3)),
        title TEXT NOT NULL,
        mission_body TEXT NOT NULL,
        completion_type VARCHAR(10) NOT NULL CHECK (completion_type IN ('phrase', 'signoff')),
        success_key TEXT,
        signoff_prompt_template TEXT,
        variable_pool JSONB,
        signer_constraint VARCHAR(20) CHECK (signer_constraint IN ('any', 'new_signer', 'same_signer', 'admin_only')),
        same_signer_mission_id INTEGER REFERENCES phase_missions(id),
        sort_order INTEGER NOT NULL DEFAULT 0,
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
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(session_id, user_id, mission_id)
      )
    `;

    console.log('✓ Tables verified');

    // Ensure every expected column exists on every table.
    // Safe no-ops when the column is already present.
    console.log('Ensuring all columns exist...');

    // users
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS firstname VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS lastname VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS team VARCHAR(4)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ishere BOOLEAN DEFAULT true`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS alias_1 VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS alias_2 VARCHAR(50)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS passphrase TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0`;

    // missions
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS title TEXT`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS mission_body TEXT`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS assigned_agent INTEGER`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS past_assigned_agents INTEGER[]`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS assigned_now BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS mission_expires TIMESTAMP`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS success_key TEXT`;
    await sql`ALTER TABLE missions ADD COLUMN IF NOT EXISTS type VARCHAR(20)`;

    // intel
    await sql`ALTER TABLE intel ADD COLUMN IF NOT EXISTS clue_text TEXT`;
    await sql`ALTER TABLE intel ADD COLUMN IF NOT EXISTS agents_who_know INTEGER[]`;

    // teams
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS name VARCHAR(10)`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0`;

    // toys
    await sql`ALTER TABLE toys ADD COLUMN IF NOT EXISTS name VARCHAR(50)`;
    await sql`ALTER TABLE toys ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0`;

    // login_logs
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS agent_name VARCHAR(50)`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS success BOOLEAN`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS ip_address INET`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS user_agent TEXT`;
    await sql`ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP DEFAULT NOW()`;

    // agent_intel
    await sql`ALTER TABLE agent_intel ADD COLUMN IF NOT EXISTS agent_id INTEGER`;
    await sql`ALTER TABLE agent_intel ADD COLUMN IF NOT EXISTS alias VARCHAR(50)`;
    await sql`ALTER TABLE agent_intel ADD COLUMN IF NOT EXISTS intel_type VARCHAR(20)`;
    await sql`ALTER TABLE agent_intel ADD COLUMN IF NOT EXISTS intel_value VARCHAR(100)`;
    await sql`ALTER TABLE agent_intel ADD COLUMN IF NOT EXISTS position INTEGER`;

    // book_missions
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS book VARCHAR`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS clue_red VARCHAR`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS answer_red VARCHAR`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS clue_blue VARCHAR`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS answer_blue VARCHAR`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS red_completed BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS blue_completed BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS assigned_red INTEGER`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS assigned_blue INTEGER`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS previous_reds INTEGER[]`;
    await sql`ALTER TABLE book_missions ADD COLUMN IF NOT EXISTS previous_blues INTEGER[]`;

    // object_missions
    await sql`ALTER TABLE object_missions ADD COLUMN IF NOT EXISTS title VARCHAR`;
    await sql`ALTER TABLE object_missions ADD COLUMN IF NOT EXISTS mission_body TEXT`;
    await sql`ALTER TABLE object_missions ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE object_missions ADD COLUMN IF NOT EXISTS assigned_agent INTEGER`;
    await sql`ALTER TABLE object_missions ADD COLUMN IF NOT EXISTS past_assigned_agents INTEGER[]`;
    await sql`ALTER TABLE object_missions ADD COLUMN IF NOT EXISTS assigned_now BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE object_missions ADD COLUMN IF NOT EXISTS success_key TEXT`;

    // passphrase_missions
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS passphrase_template VARCHAR`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS correct_answer VARCHAR`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS incorrect_answer VARCHAR`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS assigned_receiver INTEGER`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS assigned_sender_1 INTEGER`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS assigned_sender_2 INTEGER`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS previous_receivers INTEGER[]`;
    await sql`ALTER TABLE passphrase_missions ADD COLUMN IF NOT EXISTS previous_senders INTEGER[]`;

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
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mission_refresh_interval_minutes INTEGER DEFAULT 15`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS voting_open BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_phase INTEGER DEFAULT 0`;

    // assignment_timestamp
    await sql`ALTER TABLE assignment_timestamp ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP`;
    await sql`ALTER TABLE assignment_timestamp ADD COLUMN IF NOT EXISTS currently_updating BOOLEAN DEFAULT FALSE`;

    // phase_missions
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS session_id INTEGER`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS phase INTEGER`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS title TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS mission_body TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS completion_type VARCHAR(10)`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS success_key TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS signoff_prompt_template TEXT`;
    await sql`ALTER TABLE phase_missions ADD COLUMN IF NOT EXISTS variable_pool JSONB`;
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

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_users_alias_1 ON users(alias_1)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_alias_2 ON users(alias_2)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_team ON users(team)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_ishere ON users(ishere)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON login_logs(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_login_logs_agent_name ON login_logs(agent_name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_missions_assigned_agent ON missions(assigned_agent)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_missions_assigned_now ON missions(assigned_now)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_book_missions_book ON book_missions(book)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_agent_intel_agent_id ON agent_intel(agent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_agent_intel_alias ON agent_intel(alias)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_agent_intel_type ON agent_intel(intel_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(status) WHERE status = 'active'`;
    await sql`CREATE INDEX IF NOT EXISTS idx_phase_missions_session ON phase_missions(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_phase_missions_phase ON phase_missions(session_id, phase)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_session ON player_missions(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_user ON player_missions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_mission ON player_missions(mission_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_signoff ON player_missions(signed_off_by)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_player_missions_lookup ON player_missions(session_id, user_id, completed)`;

    console.log('✓ Indexes verified');

    // Seed data — ON CONFLICT DO NOTHING so existing rows are never overwritten
    console.log('Seeding data (skipping existing rows)...');

    // Insert teams
    await sql`
      INSERT INTO teams (id, name, points) VALUES
        (1, 'red', 0),
        (2, 'blue', 0)
      ON CONFLICT DO NOTHING
    `;
    console.log('✓ Teams seeded');

    // Insert users
    const users = [
      { id: 1, firstname: 'Nikki', lastname: 'Thayer', team: 'red', ishere: true, alias_1: 'Normal', alias_2: 'Hawk', passphrase: 'Winter must be cold.', is_admin: true },
      { id: 2, firstname: 'David', lastname: 'Daw', team: 'blue', ishere: true, alias_1: 'Swift', alias_2: 'Spider', passphrase: 'Not every bird is an eagle.', is_admin: true },
      { id: 3, firstname: 'Bhavna', lastname: 'Devani', team: 'red', ishere: true, alias_1: 'Invisible', alias_2: 'Mouse', passphrase: 'Have you ever been to Cleveland in August?' },
      { id: 4, firstname: 'Peter', lastname: 'Munters', team: 'blue', ishere: true, alias_1: 'Hidden', alias_2: 'Jewel', passphrase: 'She wore a green hat by the river.' },
      { id: 5, firstname: 'Katherine', lastname: 'Ramos', team: 'red', ishere: true, alias_1: 'Exploding', alias_2: 'Panther', passphrase: 'A gold room is nothing to sneeze at.' },
      { id: 6, firstname: 'Dominic', lastname: 'Ferantelli', team: 'blue', ishere: true, alias_1: 'Fast', alias_2: 'Jaguar', passphrase: 'Alf ate cats.' },
      { id: 7, firstname: 'Jane', lastname: 'St. John', team: 'red', ishere: true, alias_1: 'Tranquil', alias_2: 'Diamond', passphrase: 'The pope has a dairy allergy.' },
      { id: 8, firstname: 'Andrew', lastname: 'Fernandez', team: 'blue', ishere: true, alias_1: 'Ominous', alias_2: 'Lizard', passphrase: 'Cardboard makes me sleepy.' },
      { id: 9, firstname: 'Brett', lastname: 'Jackson', team: 'red', ishere: true, alias_1: 'Impossible', alias_2: 'Dealer', passphrase: 'The piano has been compromised.' },
      { id: 10, firstname: 'Richard', lastname: 'Malena', team: 'blue', ishere: true, alias_1: 'Smooth', alias_2: 'Operator', passphrase: 'The thorn of the blue rose is the sharpest.' },
      { id: 11, firstname: 'Amanda', lastname: 'Rodriguez', team: 'red', ishere: true, alias_1: 'Drunken', alias_2: 'Player', passphrase: 'A knight is nothing without a jester.' },
      { id: 12, firstname: 'Alex', lastname: 'Wawro', team: 'blue', ishere: true, alias_1: 'Smooth', alias_2: 'Infiltrator', passphrase: 'Three birds are better than one.' }
    ];

    for (const user of users) {
      const result = await sql`
        INSERT INTO users (id, firstname, lastname, team, ishere, alias_1, alias_2, passphrase, is_admin, score)
        VALUES (${user.id}, ${user.firstname}, ${user.lastname}, ${user.team}, ${user.ishere}, ${user.alias_1}, ${user.alias_2}, ${user.passphrase}, ${user.is_admin || false}, 0)
        ON CONFLICT (id) DO NOTHING
      `;
      const skipped = result.length === 0 ? ' (already exists)' : '';
      const adminLabel = user.is_admin ? ' [ADMIN]' : '';
      console.log(`✓ User: ${user.firstname} ${user.lastname} (${user.alias_1} ${user.alias_2})${adminLabel}${skipped}`);
    }

    // Insert missions
    const missions = [
      { id: 1, title: 'Deep Cover', mission_body: 'Get [randomized player in attendance]\'s code name', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any codename]', type: 'social' },
      { id: 2, title: 'Word Narc', mission_body: 'Change the message board on the bookshelf to read "Cheat to win." Write down the remaining letter. Give the letter to your hosts.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'k', type: 'sabotage' },
      { id: 3, title: 'Fancy Lad', mission_body: 'There\'s a top hat on the hat rack. Put it on. If approached, give the code word \'mustard\' and write the word you get in exchange.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'rainbow', type: 'team' },
      { id: 4, title: 'Situational Awareness', mission_body: 'Complete this sentence: "The room is full of spiders."', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'But I am doing fine.', type: 'object' },
      { id: 5, title: 'Overwhelming Curiosity', mission_body: 'Get [randomized player in attendance]\'s favorite movie', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'social' },
      { id: 6, title: 'Cold War', mission_body: 'Find the hat hidden in the freezer and put it on. Give the code word \'zamboni\' and write the word you get in exchange.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'rainbow', type: 'sabotage' },
      { id: 7, title: 'Quirky Sneaky', mission_body: 'Find the person in the top hat. Give them the code word "rainbow" and write down the word you get in exchange.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'mustard', type: 'team' },
      { id: 8, title: 'Night of the Hunter', mission_body: 'There\'s a picture of a man with a tattoo on his hand. What does the tattoo say?', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Hate', type: 'object' },
      { id: 9, title: 'Extrovert', mission_body: 'Enter the name of someone you didn\'t know before tonight.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any player name]', type: 'social' },
      { id: 10, title: 'Word Thief', mission_body: 'Get someone to say their passphrase without giving them your own. Enter their passphrase.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any passphrase]', type: 'sabotage' },
      { id: 11, title: 'Good Man in a Storm', mission_body: 'Cover someone on your team while they do a mission, and enter their word here.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any mission phrase from your team]', type: 'team' },
      { id: 12, title: 'Missing Tiger', mission_body: 'There\'s a picture of a tiger without the tiger. Who is the artist?', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Baldessari, John Baldessari', type: 'object' },
      { id: 13, title: 'Fresh Air', mission_body: 'Whatever room you\'re in, go to a new room. Write down the name of the room.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any room name]', type: 'social' },
      { id: 14, title: 'Oppositional Research', mission_body: 'Enter the code name of someone on the other team.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any codename]', type: 'sabotage' },
      { id: 15, title: 'Shy Networking', mission_body: 'Call the phone number hidden in the planter furthest away from the window. Write down the reply.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Hot dogs in the desert', type: 'team' },
      { id: 16, title: 'Suave Beak', mission_body: 'There\'s a bird sculpture. What color is it?', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Black', type: 'object' },
      { id: 17, title: 'Unstoppable Charisma', mission_body: 'Take a picture and send it to the host. You\'re on the honor system, buddy.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'social' },
      { id: 18, title: 'Magic Number', mission_body: 'There\'s a deck of cards hidden in the couch cushions. If anyone asks if you have a card, give them the 5 of Diamonds and write down what they say in return.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Steven Spielberg', type: 'sabotage' },
      { id: 19, title: 'Neat Trick', mission_body: 'There\'s a deck of cards hidden in the couch cushions. If anyone asks if you have a card, give them the Ace of Spades and write down what they say in return.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Steven Spielberg', type: 'team' },
      { id: 20, title: 'Panic Button', mission_body: 'Complete the sentence: Emergency ___________ in case', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Break glass', type: 'object' },
      { id: 21, title: 'Subterfuge', mission_body: 'Make up a cover story and tell someone. Enter your fake name below.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'social' },
      { id: 22, title: 'Bigmouth Strikes Again', mission_body: 'Loudly announce \'the check is in the mail\' and write down any passphrase people give you in exchange.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any passphrase]', type: 'sabotage' },
      { id: 23, title: 'Audience Plant', mission_body: 'If you see someone with a deck of cards, ask for a card and write down the suit of the card they hand you.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'team' },
      { id: 24, title: 'Best Boy', mission_body: 'There\'s a prize on the murderboard. What is it for?', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'King of Endless Jeopardy', type: 'object' },
      { id: 25, title: 'Occupational Hazard', mission_body: 'Start some gossip about the Supertoy. ', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'social' },
      { id: 26, title: 'Nemsis', mission_body: 'Write down the name of someone on the opposite team.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any name from the opposite team]', type: 'sabotage' },
      { id: 27, title: 'Gatekeeper', mission_body: 'Ask the host for a business card. Write the house number below and drop the card in the planter furthest from the window.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '369', type: 'team' },
      { id: 28, title: 'Perfect Gentleman', mission_body: 'There\'s a book on the mantle about a guy whose last name is also a musical instrument. What is the musical instrument?', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Bass', type: 'object' },
      { id: 29, title: 'Mean Girl', mission_body: 'Start some gossip about the hosts.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'social' },
      { id: 30, title: 'Whisleblower', mission_body: 'If you see someone doing a mission, point it out to the host as loud as you can.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'sabotage' },
      { id: 31, title: 'Sound and Fury', mission_body: 'Create a distraction for your team. Use any mission phrase from your team.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'team' },
      { id: 32, title: 'Shoot the Messenger', mission_body: 'Find the message board next to the painting that says but I am doing fine. Complete the sentence: I want to ______', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Heck', type: 'object' },
      { id: 33, title: 'Jouralistic Integrity', mission_body: 'Film yourself interviewing another guest about the party and send it to the host.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'social' },
      { id: 34, title: 'Embedded Asset', mission_body: 'Go on a mission with the opposite team and enter any of their mission phrases.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'sabotage' },
      { id: 35, title: 'Secret Allies', mission_body: 'Take a picture with a teammate without getting caught and send it to the host.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '', type: 'team' },
      { id: 36, title: 'Sweet Jesus', mission_body: 'There\'s a painting of a church. What is the name of the church?', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: 'Notre Dame', type: 'object' },
      { id: 37, title: 'Easy Trust', mission_body: 'Find someone on your team and enter their codename.', completed: false, assigned_agent: null, past_assigned_agents: [], assigned_now: false, mission_expires: new Date('2025-09-25T20:00:00.000Z'), success_key: '[any codename from your team]', type: 'team' }
    ];

    for (const mission of missions) {
      await sql`
        INSERT INTO missions (id, title, mission_body, completed, assigned_agent, past_assigned_agents, assigned_now, mission_expires, success_key, type)
        VALUES (${mission.id}, ${mission.title}, ${mission.mission_body}, ${mission.completed}, ${mission.assigned_agent}, ${mission.past_assigned_agents}, ${mission.assigned_now}, ${mission.mission_expires}, ${mission.success_key}, ${mission.type})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ ${missions.length} missions seeded`);

    // Insert book missions
    const bookMissions = [
      { id: 1,  book: 'Fiasco',                     clue_red: 'Page 37, last word',                answer_red: 'Aftermath',           clue_blue: 'Page 29, last word',                answer_blue: 'Bold' },
      { id: 2,  book: 'Atlas Obscura',              clue_red: 'Page 269 Longitude',                answer_red: '76.044741',           clue_blue: 'Page 335 Longitude',               answer_blue: '89.768549' },
      { id: 3,  book: 'Understanding Exposure',     clue_red: 'Page 32, first word',               answer_red: 'Aperture',            clue_blue: 'Page 110, percentage',             answer_blue: '18 or 18%' },
      { id: 4,  book: 'The Family Acid',            clue_red: 'Page 98, ______ Grove',             answer_red: 'Bohemian',            clue_blue: 'Page 75, only word',               answer_blue: 'Clash' },
      { id: 5,  book: 'Soviet Bus Stops',           clue_red: 'Page 98, City',                     answer_red: 'Pitsunda',            clue_blue: 'Page 14, second word',             answer_blue: 'Form' },
      { id: 6,  book: 'Young Orson',                clue_red: 'Page 326, last word',               answer_red: 'business',            clue_blue: 'Page 327, last word',              answer_blue: 'theater' },
      { id: 7,  book: 'the stuff games are made of',clue_red: 'Page 79, last word',                answer_red: 'time',                clue_blue: 'page 132, last word',              answer_blue: 'demo' },
      { id: 8,  book: 'Engineering in Plain Sight', clue_red: 'Page 90, last interchange type',    answer_red: 'Stack',               clue_blue: 'Page 36, last word',               answer_blue: 'Transformer' },
      { id: 9,  book: '33 1/3 Let it Be',           clue_red: 'Page 23, last word',                answer_red: 'water',               clue_blue: 'Page 72, last word',               answer_blue: 'size' },
      { id: 10, book: 'Sports Card Album',          clue_red: 'Card #5 subject',                   answer_red: 'Zordon',              clue_blue: 'Card #11 subject',                 answer_blue: 'pterodactyl' },
      { id: 11, book: 'Good Mixing Cocktails',      clue_red: 'Drink 554',                          answer_red: 'Millionaire',         clue_blue: 'Drink 291',                         answer_blue: 'Bishop' },
      { id: 12, book: 'Shoot This One',             clue_red: 'Page 76, last word',                answer_red: 'Patrol',              clue_blue: 'Page 138, last word',              answer_blue: 'Vindicate' },
      { id: 13, book: 'L.A. Bizarro',               clue_red: 'Page 90, last word',                answer_red: 'Ramen',               clue_blue: 'Page 284, last word',              answer_blue: 'Death' },
      { id: 14, book: 'Hark, a Vagrant',            clue_red: 'Page 15, first word',               answer_red: 'Watson',              clue_blue: 'Page 70, first word',              answer_blue: 'Credit' },
      { id: 15, book: 'Color Problems',             clue_red: 'Page 50, last word',                answer_red: 'hollows',             clue_blue: 'Page 103, last word',              answer_blue: 'Jonquil' },
      { id: 16, book: 'Planning Your Escape',       clue_red: 'Page 97, last word',                answer_red: 'Wits',                clue_blue: 'page 212, last word',              answer_blue: 'FUVSG' }
    ];

    for (const bm of bookMissions) {
      await sql`
        INSERT INTO book_missions (id, book, clue_red, answer_red, clue_blue, answer_blue, assigned_red, assigned_blue, previous_reds, previous_blues)
        VALUES (${bm.id}, ${bm.book}, ${bm.clue_red}, ${bm.answer_red}, ${bm.clue_blue}, ${bm.answer_blue}, ${null}, ${null}, ${[]}, ${[]})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ ${bookMissions.length} book missions seeded`);

    // Insert passphrase missions
    const passphraseMissions = [
      { id: 1,  passphrase_template: 'They say the ___ on the Spanish plains are beautiful.',        correct_answer: 'stars',    incorrect_answer: 'trees' },
      { id: 2,  passphrase_template: 'The fountain in ___ runs dry at midnight.',                     correct_answer: 'Rome',     incorrect_answer: 'London' },
      { id: 3,  passphrase_template: 'The bells of Prague ring twice on ___.',                        correct_answer: 'Tuesdays', incorrect_answer: 'Thursdays' },
      { id: 4,  passphrase_template: '___ fog settles heavy over London bridges.',                    correct_answer: 'Winter',   incorrect_answer: 'Summer' },
      { id: 5,  passphrase_template: 'The Paris metro smells of fresh bread at ___.',                 correct_answer: 'dawn',     incorrect_answer: 'dusk' },
      { id: 6,  passphrase_template: 'They say the mountains in Vienna touch the ___.',               correct_answer: 'clouds',   incorrect_answer: 'moon' },
      { id: 7,  passphrase_template: 'The canals of Venice freeze when the moon is ___.',             correct_answer: 'full',     incorrect_answer: 'new' },
      { id: 8,  passphrase_template: 'Berlin cafes serve the best coffee ___ sunset.',                correct_answer: 'after',    incorrect_answer: 'before' },
      { id: 9,  passphrase_template: 'The windmills of ___ turn counterclockwise in spring.',         correct_answer: 'Amsterdam', incorrect_answer: 'Berlin' },
      { id: 10, passphrase_template: 'The castle gates in Edinburgh close ___ noon.',                 correct_answer: 'before',   incorrect_answer: 'after' },
      { id: 11, passphrase_template: 'Stockholm\'s harbor lights flicker three times at ___.',        correct_answer: 'dusk',     incorrect_answer: 'dawn' },
      { id: 12, passphrase_template: 'The ___ in Brussels shine brightest in rain.',                  correct_answer: 'cobblestones', incorrect_answer: 'streetlights' }
    ];

    for (const pm of passphraseMissions) {
      await sql`
        INSERT INTO passphrase_missions (id, passphrase_template, correct_answer, incorrect_answer, assigned_receiver, assigned_sender_1, assigned_sender_2, previous_receivers, previous_senders)
        VALUES (${pm.id}, ${pm.passphrase_template}, ${pm.correct_answer}, ${pm.incorrect_answer}, ${null}, ${null}, ${null}, ${[]}, ${[]})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ ${passphraseMissions.length} passphrase missions seeded`);

    // Insert object missions
    const objectMissions = [
      { id: 4, title: "Situational Awareness", mission_body: "Complete this sentence: \"The room is full of spiders. But I am\"", success_key: "doing fine." },
      { id: 8, title: "Night of the Hunter", mission_body: "There's a picture of a man with a tattoo on his hand. What does the tattoo say?", success_key: "Hate" },
      { id: 12, title: "Missing Tiger", mission_body: "There's a picture of a tiger without the tiger. Who is the artist?", success_key: "Baldessari" },
      { id: 16, title: "Suave Beak", mission_body: "There's a bird sculpture. What color is it?", success_key: "Black" },
      { id: 20, title: "Panic Button", mission_body: "Complete the sentence: Emergency ___________ in case", success_key: "Break glass" },
      { id: 24, title: "Best Boy", mission_body: "There's a prize on the murderboard. It's for the king of what?", success_key: "Endless Jeopardy" },
      { id: 28, title: "Perfect Gentleman", mission_body: "There's a book on the mantle about a guy whose last name is also a musical instrument. What is the musical instrument?", success_key: "Bass" },
      { id: 32, title: "Shoot the Messenger", mission_body: "Find the message board next to the painting that says but I am doing fine. Complete the sentence: I want to ______", success_key: "Heck" },
      { id: 36, title: "Sweet Jesus", mission_body: "There's a painting of a church. What is the name of the church?", success_key: "Notre Dame" }
    ];

    for (const om of objectMissions) {
      await sql`
        INSERT INTO object_missions (id, title, mission_body, completed, assigned_agent, past_assigned_agents, assigned_now, success_key)
        VALUES (${om.id}, ${om.title}, ${om.mission_body}, false, ${null}, ${[]}, false, ${om.success_key})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ ${objectMissions.length} object missions seeded`);

    // Initialize assignment_timestamp
    await sql`
      INSERT INTO assignment_timestamp (id, last_assigned_at, currently_updating)
      VALUES (1, NOW(), FALSE)
      ON CONFLICT (id) DO NOTHING
    `;
    console.log('✓ Assignment timestamp verified');

    console.log('\n✓ Database setup completed successfully (no data was overwritten)!');
    console.log('\nYou can now start the server with: npm start');

  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  }
}

setupNeonDatabase();
