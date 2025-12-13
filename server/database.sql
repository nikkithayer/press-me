-- Create the spy database
CREATE DATABASE spy_database;

-- Connect to the spy database
\c spy_database;

-- Create users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    firstname VARCHAR(50) NOT NULL,
    lastname VARCHAR(50) NOT NULL,
    team VARCHAR(4) NOT NULL,
    ishere BOOLEAN DEFAULT true,
    alias_1 VARCHAR(50) NOT NULL,
    alias_2 VARCHAR(50) NOT NULL,
    passphrase TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create intel table
CREATE TABLE intel (
    id SERIAL PRIMARY KEY,
    clue_text TEXT NOT NULL,
    agents_who_know INTEGER[]
);

-- Create missions table
CREATE TABLE missions (
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
);

-- Create teams table
INSERT INTO teams (id, name, points) VALUES
    (1, 'red', 0),
    (2, 'blue', 0);

-- Create toys table
CREATE TABLE toys (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    points INTEGER DEFAULT 0
);

-- Create login_logs table
CREATE TABLE login_logs (
    id SERIAL PRIMARY KEY,
    agent_name VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Insert users with new format
INSERT INTO users (id, firstname, lastname, team, ishere, alias_1, alias_2, passphrase, is_admin) VALUES
    (1, 'Nikki', 'Thayer', 'red', true, 'Normal', 'Hawk', 'Winter must be cold.', true),
    (2, 'David', 'Daw', 'blue', true, 'Swift', 'Spider', 'Not every bird is an eagle.', true),
    (3, 'Bhavna', 'Devani', 'red', true, 'Invisible', 'Mouse', 'Have you ever been to Cleveland in August?', false),
    (4, 'Peter', 'Munters', 'blue', true, 'Hidden', 'Jewel', 'She wore a green hat by the river.', false),
    (5, 'Katherine', 'Ramos', 'red', true, 'Exploding', 'Panther', 'A gold room is nothing to sneeze at.', false),
    (6, 'Dominic', 'Ferantelli', 'blue', true, 'Fast', 'Jaguar', 'Alf ate cats.', false),
    (7, 'Jane', 'St. John', 'red', true, 'Tranquil', 'Diamond', 'The pope has a dairy allergy.', false),
    (8, 'Andrew', 'Fernandez', 'blue', true, 'Ominous', 'Lizard', 'Cardboard makes me sleepy.', false),
    (9, 'Brett', 'Jackson', 'red', true, 'Impossible', 'Dealer', 'The piano has been compromised.', false),
    (10, 'Richard', 'Malena', 'blue', true, 'Cool', 'Operator', 'The thorn of the blue rose is the sharpest.', false),
    (11, 'Amanda', 'Rodriguez', 'red', true, 'Drunken', 'Player', 'A knight is nothing without a jester.', false),
    (12, 'Alex', 'Wawro', 'blue', true, 'Smooth', 'Infiltrator', 'Three birds are better than one.', false);

-- Create indexes for better performance
CREATE INDEX idx_users_alias_1 ON users(alias_1);
CREATE INDEX idx_users_alias_2 ON users(alias_2);
CREATE INDEX idx_users_team ON users(team);
CREATE INDEX idx_users_ishere ON users(ishere);
CREATE INDEX idx_login_logs_timestamp ON login_logs(timestamp);
CREATE INDEX idx_login_logs_agent_name ON login_logs(agent_name);
CREATE INDEX idx_missions_assigned_agent ON missions(assigned_agent);
CREATE INDEX idx_missions_assigned_now ON missions(assigned_now);

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON DATABASE spy_database TO your_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user; 