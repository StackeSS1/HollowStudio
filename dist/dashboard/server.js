"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const node_crypto_1 = require("node:crypto");
const pool_1 = require("../database/pool");
const app = (0, express_1.default)();
const PORT = Number(process.env.DASHBOARD_PORT || 8787);
const PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const SECRET = process.env.DASHBOARD_SECRET || '';
const COOKIE = 'hollow_dashboard_session';
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: '20kb' }));
function sign(value) {
    return (0, node_crypto_1.createHmac)('sha256', SECRET).update(value).digest('hex');
}
function createToken() {
    const payload = Buffer.from(JSON.stringify({
        exp: Date.now() + 12 * 60 * 60 * 1000
    })).toString('base64url');
    return `${payload}.${sign(payload)}`;
}
function authenticated(req) {
    const entry = (req.headers.cookie || '')
        .split(';')
        .find(value => value.trim().startsWith(`${COOKIE}=`));
    if (!entry)
        return false;
    const token = entry.trim().slice(COOKIE.length + 1);
    const [payload, signature] = token.split('.');
    if (!payload || !signature)
        return false;
    const expected = sign(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b)) {
        return false;
    }
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return data.exp > Date.now();
    }
    catch {
        return false;
    }
}
function requireAuth(req, res, next) {
    if (!authenticated(req)) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
    }
    next();
}
app.post('/api/auth/login', (req, res) => {
    if (!PASSWORD || !SECRET) {
        res.status(500).json({ error: 'Dashboard credentials are not configured.' });
        return;
    }
    const password = String(req.body?.password || '');
    const supplied = Buffer.from(password);
    const expected = Buffer.from(PASSWORD);
    if (supplied.length !== expected.length ||
        !(0, node_crypto_1.timingSafeEqual)(supplied, expected)) {
        res.status(401).json({ error: 'Invalid password.' });
        return;
    }
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${createToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
    res.json({ ok: true });
});
app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ ok: true });
});
app.get('/api/auth/me', (req, res) => {
    res.json({ authenticated: authenticated(req) });
});
async function initializeDashboardDatabase() {
    await pool_1.pool.query(`
    ALTER TABLE suggestions
    ADD COLUMN IF NOT EXISTS status VARCHAR(30)
    NOT NULL DEFAULT 'Pending'
  `);
    await pool_1.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suggestions_status
    ON suggestions(status)
  `);
    await pool_1.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suggestions_category
    ON suggestions(category)
  `);
    await pool_1.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_suggestion_votes_suggestion_vote
    ON suggestion_votes(suggestion_id, vote)
  `);
    await pool_1.pool.query(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      section VARCHAR(50) PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
    await pool_1.pool.query(`
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
        await pool_1.pool.query('SELECT 1');
        const result = await pool_1.pool.query(`
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
    }
    catch (error) {
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
        const result = await pool_1.pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'Under Review')::int AS under_review,
        COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'Rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'Implemented')::int AS implemented
      FROM suggestions
    `);
        res.json(result.rows[0]);
    }
    catch (error) {
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
        const sortOptions = {
            newest: 's.created_at DESC, s.id DESC',
            upvotes: 'upvotes DESC, total_votes DESC, s.created_at DESC',
            downvotes: 'downvotes DESC, total_votes DESC, s.created_at DESC',
            votes: 'total_votes DESC, s.created_at DESC'
        };
        const orderBy = sortOptions[sort] || sortOptions.newest;
        const conditions = [];
        const values = [];
        if (search) {
            values.push(`%${search}%`);
            conditions.push(`(s.content ILIKE $${values.length} OR s.user_id ILIKE $${values.length})`);
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
        const countResult = await pool_1.pool.query(`SELECT COUNT(*)::int AS total FROM suggestions s ${where}`, values);
        const total = countResult.rows[0].total;
        const dataResult = await pool_1.pool.query(`SELECT
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
         GROUP BY suggestion_id
       ) v ON v.suggestion_id = s.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`, values);
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
    }
    catch (error) {
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
        const result = await pool_1.pool.query(`UPDATE suggestions
       SET status = $1
       WHERE id = $2
       RETURNING id, user_id, category, content, status, created_at`, [status, id]);
        if (result.rowCount === 0) {
            res.status(404).json({ error: 'Suggestion not found.' });
            return;
        }
        res.json({ suggestion: result.rows[0] });
    }
    catch (error) {
        console.error('[DASHBOARD] Status update error:', error);
        res.status(500).json({ error: 'Could not update suggestion status.' });
    }
});
app.get('/api/dashboard/categories', requireAuth, async (_req, res) => {
    try {
        const result = await pool_1.pool.query(`
      SELECT DISTINCT category
      FROM suggestions
      ORDER BY category ASC
    `);
        res.json({ categories: result.rows.map(row => row.category) });
    }
    catch (error) {
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
];
app.get('/api/dashboard/settings', requireAuth, async (_req, res) => {
    try {
        const result = await pool_1.pool.query(`
      SELECT section, settings, updated_at
      FROM bot_settings
      ORDER BY section ASC
    `);
        const settings = {};
        for (const section of SETTINGS_SECTIONS) {
            settings[section] = {};
        }
        for (const row of result.rows) {
            settings[row.section] = row.settings;
        }
        res.json({ settings });
    }
    catch (error) {
        console.error('[DASHBOARD] Settings read error:', error);
        res.status(500).json({ error: 'Could not load bot settings.' });
    }
});
app.put('/api/dashboard/settings/:section', requireAuth, async (req, res) => {
    try {
        const section = String(req.params.section);
        const settings = req.body?.settings;
        if (!SETTINGS_SECTIONS.includes(section)) {
            res.status(400).json({ error: 'Unknown settings section.' });
            return;
        }
        if (!settings ||
            typeof settings !== 'object' ||
            Array.isArray(settings)) {
            res.status(400).json({ error: 'Settings must be a JSON object.' });
            return;
        }
        const result = await pool_1.pool.query(`
      INSERT INTO bot_settings (section, settings, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (section)
      DO UPDATE SET
        settings = EXCLUDED.settings,
        updated_at = NOW()
      RETURNING section, settings, updated_at
    `, [section, JSON.stringify(settings)]);
        res.json({
            ok: true,
            ...result.rows[0]
        });
    }
    catch (error) {
        console.error('[DASHBOARD] Settings update error:', error);
        res.status(500).json({ error: 'Could not save bot settings.' });
    }
});
async function start() {
    if (!PASSWORD || !SECRET) {
        console.error('[DASHBOARD] Set DASHBOARD_PASSWORD and DASHBOARD_SECRET in .env');
        process.exit(1);
    }
    await initializeDashboardDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[DASHBOARD] API running on port ${PORT}`);
    });
}
start().catch(error => {
    console.error('[DASHBOARD] Startup failed:', error);
    process.exit(1);
});
