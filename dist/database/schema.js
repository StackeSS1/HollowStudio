"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
const pool_1 = require("./pool");
const schema = `
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id VARCHAR(20) PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  moderator_id VARCHAR(20) NOT NULL,
  action VARCHAR(30) NOT NULL,
  reason TEXT,
  duration BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_cases_guild
ON moderation_cases(guild_id);

CREATE INDEX IF NOT EXISTS idx_mod_cases_user
ON moderation_cases(guild_id, user_id);

CREATE TABLE IF NOT EXISTS warnings (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  moderator_id VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warnings_user
ON warnings(guild_id, user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  actor_id VARCHAR(20),
  action VARCHAR(100) NOT NULL,
  target_id VARCHAR(20),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_guild
ON audit_logs(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS roblox_accounts (
  discord_id VARCHAR(20) PRIMARY KEY,
  roblox_id BIGINT NOT NULL UNIQUE,
  roblox_username VARCHAR(100) NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_events (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) UNIQUE,
  user_id VARCHAR(20) NOT NULL,
  category VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  claimed_by VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS member_statistics (
  guild_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  messages BIGINT NOT NULL DEFAULT 0,
  voice_seconds BIGINT NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  PRIMARY KEY (guild_id, user_id)
);

ALTER TABLE roblox_accounts
ADD COLUMN IF NOT EXISTS guild_id VARCHAR(20);

ALTER TABLE roblox_accounts
ADD COLUMN IF NOT EXISTS group_id BIGINT;

CREATE TABLE IF NOT EXISTS pending_roblox_verifications (
  discord_id VARCHAR(20) PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  roblox_id BIGINT NOT NULL,
  roblox_username VARCHAR(100) NOT NULL,
  verification_code VARCHAR(40) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS suggestions (
  id BIGSERIAL PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  channel_id VARCHAR(20) NOT NULL,
  message_id VARCHAR(20),
  user_id VARCHAR(20) NOT NULL,
  category VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_guild
ON suggestions(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS suggestion_votes (
  suggestion_id BIGINT NOT NULL
    REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id VARCHAR(20) NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (suggestion_id, user_id)
);

`;
async function initializeDatabase() {
    await pool_1.pool.query(schema);
    console.log('[DATABASE] Schema initialized successfully.');
}
