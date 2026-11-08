import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from '../database/pool';
import type { Client } from 'discord.js';


const app = express();
const PORT = Number(process.env.DASHBOARD_PORT || 8787);
const PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const SECRET = process.env.DASHBOARD_SECRET || '';

let ACTIVE_GUILD_ID = '';
let apiServer: ReturnType<typeof app.listen> | null = null;

app.use(helmet());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = (process.env.DASHBOARD_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json({ limit: '20kb' }));

function sign(value: string) {
  return createHmac('sha256', SECRET).update(value).digest('hex');
}


function createToken(discordId: string, kind = 'session', ttl = 30 * 24 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({
    sub: discordId,
    kind,
    exp: Date.now() + ttl
  })).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string, kind: string) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.kind !== kind || typeof data.exp !== 'number' ||
        data.exp <= Date.now() || typeof data.sub !== 'string') return null;
    return data as { sub: string; kind: string; exp: number };
  } catch {
    return null;
  }
}

function authenticated(req: express.Request): boolean {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  return Boolean(verifyToken(header.slice(7), 'session'));
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!authenticated(req)) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  next();
}


const DASHBOARD_URL = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || '';

app.get('/api/auth/discord', (_req, res) => {
  if (!process.env.CLIENT_ID || !DISCORD_CLIENT_SECRET ||
      !DISCORD_REDIRECT_URI || !DASHBOARD_URL || !SECRET) {
    res.status(503).send('Discord login is not configured.');
    return;
  }

  const state = createToken(randomBytes(24).toString('hex'), 'oauth_state', 600000);
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const fail = (message: string) => {
    res.redirect(`${DASHBOARD_URL}/#discord_error=${encodeURIComponent(message)}`);
  };

  try {
    if (req.query.error) {
      fail('Discord authorization was cancelled.');
      return;
    }

    const code = String(req.query.code || '');
    const state = String(req.query.state || '');

    if (!code || !verifyToken(state, 'oauth_state')) {
      fail('Invalid or expired Discord login request.');
      return;
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID || '',
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      fail('Discord token exchange failed.');
      return;
    }

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      token_type?: string;
    };

    if (!tokenData.access_token) {
      fail('Discord access token missing.');
      return;
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `${tokenData.token_type || 'Bearer'} ${tokenData.access_token}`
      }
    });

    if (!userResponse.ok) {
      fail('Could not verify Discord account.');
      return;
    }

    const user = await userResponse.json() as { id?: string };

    if (!user.id) {
      fail('Discord account ID missing.');
      return;
    }

    const authorized = await pool.query(
      'SELECT discord_id FROM dashboard_authorized_users WHERE discord_id = $1',
      [user.id]
    );

    if (authorized.rowCount) {
      const session = createToken(user.id);
      res.redirect(`${DASHBOARD_URL}/#discord_token=${encodeURIComponent(session)}`);
      return;
    }

    const pending = createToken(user.id, 'pending_authorization', 600000);
    res.redirect(`${DASHBOARD_URL}/#discord_pending=${encodeURIComponent(pending)}`);
  } catch (error) {
    console.error('[DASHBOARD AUTH] Discord OAuth error:', error);
    fail('Discord login failed.');
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!PASSWORD || !SECRET) {
    res.status(500).json({ error: 'Dashboard credentials are not configured.' });
    return;
  }

  const pending = verifyToken(
    String(req.body?.pendingToken || ''),
    'pending_authorization'
  );

  if (!pending) {
    res.status(401).json({ error: 'Connect Discord first.' });
    return;
  }

  const supplied = Buffer.from(String(req.body?.password || ''));
  const expected = Buffer.from(PASSWORD);

  if (supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)) {
    res.status(401).json({ error: 'Invalid password.' });
    return;
  }

  try {
    await pool.query(`
      INSERT INTO dashboard_authorized_users (discord_id)
      VALUES ($1)
      ON CONFLICT (discord_id) DO NOTHING
    `, [pending.sub]);

    res.json({ ok: true, token: createToken(pending.sub) });
  } catch (error) {
    console.error('[DASHBOARD AUTH] Authorization save failed:', error);
    res.status(500).json({ error: 'Could not save Discord authorization.' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const header = req.headers.authorization || '';
  const session = header.startsWith('Bearer ')
    ? verifyToken(header.slice(7), 'session')
    : null;

  res.json({
    authenticated: Boolean(session),
    discordId: session?.sub || null
  });
});

async function initializeDashboardDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_authorized_users (
      discord_id VARCHAR(20) PRIMARY KEY,
      authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_activity_logs (
      id BIGSERIAL PRIMARY KEY,
      guild_id VARCHAR(20) NOT NULL,
      actor VARCHAR(100) NOT NULL,
      action VARCHAR(60) NOT NULL,
      section VARCHAR(50) NOT NULL,
      old_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dashboard_activity_guild_created
    ON dashboard_activity_logs (guild_id, created_at DESC)
  `);

  await pool.query(`
    ALTER TABLE suggestions
    ADD COLUMN IF NOT EXISTS status VARCHAR(30)
    NOT NULL DEFAULT 'Pending'
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suggestions_status
    ON suggestions(status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suggestions_category
    ON suggestions(category)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suggestion_votes_suggestion_vote
    ON suggestion_votes(suggestion_id, vote)
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_telemetry (
      id INTEGER PRIMARY KEY,
      process_id INTEGER NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      discord_ping INTEGER NOT NULL DEFAULT -1,
      guild_count INTEGER NOT NULL DEFAULT 0,
      member_count BIGINT NOT NULL DEFAULT 0
    )
  `);

  console.log('[DASHBOARD] Database ready.');
}


const VALID_STATUSES = [
  'Pending',
  'Under Review',
  'Approved',
  'Rejected',
  'Implemented'
];

app.get('/api/dashboard/monitor', requireAuth, async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    const result = await pool.query(`
      SELECT
        (updated_at > NOW() - INTERVAL '45 seconds') AS online,
        started_at,
        updated_at,
        discord_ping,
        guild_count,
        member_count
      FROM bot_telemetry
      WHERE id = 1
    `);

    const row = result.rows[0];

    if (!row) {
      res.json({
        databaseOnline: true,
        botOnline: false,
        uptimeSeconds: 0,
        discordPing: -1,
        guildCount: 0,
        memberCount: 0,
        lastHeartbeat: null
      });
      return;
    }

    res.json({
      databaseOnline: true,
      botOnline: row.online,
      uptimeSeconds: row.online
        ? Math.max(0, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000))
        : 0,
      discordPing: row.discord_ping,
      guildCount: row.guild_count,
      memberCount: Number(row.member_count),
      lastHeartbeat: row.updated_at
    });
  } catch (error) {
    console.error('[DASHBOARD] Monitor error:', error);
    res.status(500).json({
      databaseOnline: false,
      botOnline: false,
      error: 'Could not load system telemetry.'
    });
  }
});

app.get('/api/dashboard/stats', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'Under Review')::int AS under_review,
        COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'Implemented')::int AS implemented
      FROM suggestions
      WHERE guild_id = $1
    `, [ACTIVE_GUILD_ID]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[DASHBOARD] Stats error:', error);
    res.status(500).json({ error: 'Could not load statistics.' });
  }
});

app.get('/api/dashboard/suggestions', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    const search = String(req.query.search || '').trim().slice(0, 100);
    const category = String(req.query.category || '').trim();
    const status = String(req.query.status || '').trim();
    const sort = String(req.query.sort || 'newest');

    const sortOptions: Record<string, string> = {
      newest: 's.created_at DESC, s.id DESC',
      upvotes: 'upvotes DESC, total_votes DESC, s.created_at DESC',
      downvotes: 'downvotes DESC, total_votes DESC, s.created_at DESC',
      votes: 'total_votes DESC, s.created_at DESC'
    };

    const orderBy = sortOptions[sort] || sortOptions.newest;

    const conditions: string[] = ['s.guild_id = $1'];
    const values: unknown[] = [ACTIVE_GUILD_ID];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(
        `(s.content ILIKE $${values.length} OR s.user_id ILIKE $${values.length})`
      );
    }

    if (category) {
      values.push(category);
      conditions.push(`s.category = $${values.length}`);
    }

    if (status && VALID_STATUSES.includes(status)) {
      values.push(status);
      conditions.push(`s.status = $${values.length}`);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM suggestions s ${where}`,
      values
    );

    const total = countResult.rows[0].total;

    const dataResult = await pool.query(
      `SELECT
         s.id,
         s.user_id,
         s.category,
         s.content,
         s.status,
         s.created_at,
         COALESCE(v.upvotes, 0)::int AS upvotes,
         COALESCE(v.downvotes, 0)::int AS downvotes,
         COALESCE(v.upvotes, 0)::int + COALESCE(v.downvotes, 0)::int AS total_votes
       FROM suggestions s
       LEFT JOIN (
         SELECT
           suggestion_id,
           COUNT(*) FILTER (WHERE vote = 'up') AS upvotes,
           COUNT(*) FILTER (WHERE vote = 'down') AS downvotes
         FROM suggestion_votes
         INNER JOIN suggestions scoped_suggestions
           ON scoped_suggestions.id = suggestion_votes.suggestion_id
         WHERE scoped_suggestions.guild_id = $1
         GROUP BY suggestion_id
       ) v ON v.suggestion_id = s.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      values
    );

    res.json({
      suggestions: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      sort: sortOptions[sort] ? sort : 'newest'
    });
  } catch (error) {
    console.error('[DASHBOARD] Suggestions error:', error);
    res.status(500).json({ error: 'Could not load suggestions.' });
  }
});

app.patch('/api/dashboard/suggestions/:id/status', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const status = String(req.body?.status || '');

    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: 'Invalid suggestion ID.' });
      return;
    }

    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid suggestion status.' });
      return;
    }

    const result = await pool.query(
      `UPDATE suggestions
       SET status = $1
       WHERE id = $2 AND guild_id = $3
       RETURNING id, user_id, category, content, status, created_at`,
      [status, id, ACTIVE_GUILD_ID]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Suggestion not found.' });
      return;
    }

    res.json({ suggestion: result.rows[0] });
  } catch (error) {
    console.error('[DASHBOARD] Status update error:', error);
    res.status(500).json({ error: 'Could not update suggestion status.' });
  }
});

app.get('/api/dashboard/categories', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category
      FROM suggestions
      WHERE guild_id = $1
      ORDER BY category ASC
    `, [ACTIVE_GUILD_ID]);

    res.json({ categories: result.rows.map(row => row.category) });
  } catch (error) {
    console.error('[DASHBOARD] Categories error:', error);
    res.status(500).json({ error: 'Could not load categories.' });
  }
});


const SETTINGS_SECTIONS = [
  'general',
  'welcome',
  'moderation',
  'tickets',
  'roblox',
  'suggestions'
] as const;


app.get('/api/dashboard/activity', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, actor, action, section, old_values, new_values, created_at
      FROM dashboard_activity_logs
      WHERE guild_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `, [ACTIVE_GUILD_ID]);

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('[DASHBOARD] Activity read error:', error);
    res.status(500).json({ error: 'Could not load activity history.' });
  }
});

app.get('/api/dashboard/settings', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT settings FROM guild_settings WHERE guild_id = $1',
      [ACTIVE_GUILD_ID]
    );

    const stored = result.rows[0]?.settings || {};
    const settings: Record<string, unknown> = {};

    for (const section of SETTINGS_SECTIONS) {
      settings[section] = stored[section] || {};
    }

    res.json({ settings, guildId: ACTIVE_GUILD_ID });
  } catch (error) {
    console.error('[DASHBOARD] Settings read error:', error);
    res.status(500).json({ error: 'Could not load bot settings.' });
  }
});

app.put('/api/dashboard/settings/:section', requireAuth, async (req, res) => {
  try {
    const section = String(req.params.section);
    const settings = req.body?.settings;

    if (!SETTINGS_SECTIONS.includes(section as typeof SETTINGS_SECTIONS[number])) {
      res.status(400).json({ error: 'Unknown settings section.' });
      return;
    }

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      res.status(400).json({ error: 'Settings must be a JSON object.' });
      return;
    }

    const normalized = { ...settings };

    if (section === 'tickets' && normalized.supportRoleId !== undefined) {
      normalized.staffRoleId = normalized.supportRoleId;
      delete normalized.supportRoleId;
    }

    if (section === 'roblox' && normalized.verifiedRoleId !== undefined) {
      normalized.roleId = normalized.verifiedRoleId;
      delete normalized.verifiedRoleId;
    }

    const db = await pool.connect();

    try {
      await db.query('BEGIN');

      const previous = await db.query(
        'SELECT settings -> $2 AS section_settings FROM guild_settings WHERE guild_id = $1 FOR UPDATE',
        [ACTIVE_GUILD_ID, section]
      );

      const oldSettings = previous.rows[0]?.section_settings ?? {};

      await db.query(`
        INSERT INTO guild_settings (guild_id, settings)
        VALUES ($1, jsonb_build_object($2, $3::jsonb))
        ON CONFLICT (guild_id)
        DO UPDATE SET
          settings = jsonb_set(
            COALESCE(guild_settings.settings, '{}'::jsonb),
            ARRAY[$2],
            $3::jsonb,
            true
          ),
          updated_at = NOW()
      `, [ACTIVE_GUILD_ID, section, JSON.stringify(normalized)]);

      await db.query(`
        INSERT INTO dashboard_activity_logs
          (guild_id, actor, action, section, old_values, new_values)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      `, [
        ACTIVE_GUILD_ID,
        'Dashboard administrator',
        'settings.updated',
        section,
        JSON.stringify(oldSettings),
        JSON.stringify(normalized)
      ]);

      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }

    res.json({ ok: true, section, settings: normalized });
  } catch (error) {
    console.error('[DASHBOARD] Settings update error:', error);
    res.status(500).json({ error: 'Could not save bot settings.' });
  }
});


export async function startDashboardServer(client: Client) {
  if (apiServer) {
    console.log('[DASHBOARD] API is already running.');
    return;
  }

  if (!PASSWORD || !SECRET) {
    console.error('[DASHBOARD] DASHBOARD_PASSWORD and DASHBOARD_SECRET must be configured.');
    return;
  }

  const configuredGuildId = process.env.DASHBOARD_GUILD_ID?.trim();

  if (configuredGuildId) {
    if (!client.guilds.cache.has(configuredGuildId)) {
      console.error('[DASHBOARD] DASHBOARD_GUILD_ID is not a guild connected to this bot.');
      return;
    }
    ACTIVE_GUILD_ID = configuredGuildId;
  } else if (client.guilds.cache.size === 1) {
    ACTIVE_GUILD_ID = client.guilds.cache.first()!.id;
  } else {
    console.error('[DASHBOARD] Set DASHBOARD_GUILD_ID because the bot is in zero or multiple guilds.');
    return;
  }

  try {
    await initializeDashboardDatabase();

    apiServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[DASHBOARD] API running on port ${PORT} for guild ${ACTIVE_GUILD_ID}`);
    });
  } catch (error) {
    console.error('[DASHBOARD] Startup failed:', error);
  }
}
