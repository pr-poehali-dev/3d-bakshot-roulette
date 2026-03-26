
CREATE TABLE IF NOT EXISTS bsr_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  coins INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bsr_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id INTEGER REFERENCES bsr_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);

CREATE TABLE IF NOT EXISTS bsr_games (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(8) UNIQUE NOT NULL,
  status VARCHAR(16) DEFAULT 'waiting',
  mode VARCHAR(16) DEFAULT 'pvp',
  max_players INTEGER DEFAULT 2,
  current_turn INTEGER DEFAULT 0,
  round INTEGER DEFAULT 1,
  game_state JSONB DEFAULT '{}',
  created_by INTEGER REFERENCES bsr_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bsr_game_players (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES bsr_games(id),
  user_id INTEGER REFERENCES bsr_users(id),
  slot INTEGER NOT NULL,
  is_bot BOOLEAN DEFAULT FALSE,
  bot_name VARCHAR(32),
  hp INTEGER DEFAULT 2,
  max_hp INTEGER DEFAULT 2,
  coins INTEGER DEFAULT 0,
  items JSONB DEFAULT '[]',
  alive BOOLEAN DEFAULT TRUE,
  is_winner BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS bsr_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES bsr_users(id) UNIQUE,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  total_shots INTEGER DEFAULT 0,
  live_shots INTEGER DEFAULT 0,
  blank_shots INTEGER DEFAULT 0,
  coins_earned INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bsr_game_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES bsr_users(id),
  game_id INTEGER REFERENCES bsr_games(id),
  result VARCHAR(8) NOT NULL,
  score INTEGER DEFAULT 0,
  rounds INTEGER DEFAULT 1,
  coins_change INTEGER DEFAULT 0,
  players_count INTEGER DEFAULT 2,
  played_at TIMESTAMP DEFAULT NOW()
);
