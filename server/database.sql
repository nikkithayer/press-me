-- Active schema for press-me (MacGuffin Toys / FBS game)
-- Tables: users, login_logs, sessions, phase_missions, player_missions

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
);

CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    agent_name VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

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
);

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
);

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
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_alias_1 ON users(alias_1);
CREATE INDEX IF NOT EXISTS idx_users_alias_2 ON users(alias_2);
CREATE INDEX IF NOT EXISTS idx_users_ishere ON users(ishere);
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON login_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_login_logs_agent_name ON login_logs(agent_name);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_phase_missions_phase ON phase_missions(phase);
CREATE INDEX IF NOT EXISTS idx_player_missions_session ON player_missions(session_id);
CREATE INDEX IF NOT EXISTS idx_player_missions_user ON player_missions(user_id);
CREATE INDEX IF NOT EXISTS idx_player_missions_mission ON player_missions(mission_id);
CREATE INDEX IF NOT EXISTS idx_player_missions_signoff ON player_missions(signed_off_by);
CREATE INDEX IF NOT EXISTS idx_player_missions_lookup ON player_missions(session_id, user_id, completed);
