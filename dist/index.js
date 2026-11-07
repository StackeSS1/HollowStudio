"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_util_1 = require("node:util");
const node_child_process_1 = require("node:child_process");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const discord_js_1 = require("discord.js");
const command_handler_1 = require("./handlers/command-handler");
const pool_1 = require("./database/pool");
const logger_1 = require("./utils/logger");
const service_1 = require("./roblox/service");
const token = process.env.DISCORD_TOKEN;
if (!token) {
    logger_1.logger.error('Missing DISCORD_TOKEN in .env');
    process.exit(1);
}
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMembers]
});
client.on(discord_js_1.Events.GuildMemberAdd, async (member) => {
    let tempDir = '';
    try {
        // AUTO ROLE: 1567125433089007727
        try {
            await member.roles.add('1567125433089007727', 'Automatic role for new members');
            logger_1.logger.info(`AutoRole assigned to ${member.user.tag}`);
        }
        catch (roleError) {
            logger_1.logger.error(`Failed to assign AutoRole to ${member.user.tag}`, roleError);
        }
        // Prevent duplicate welcome messages for the same member.
        await pool_1.pool.query(`
      CREATE TABLE IF NOT EXISTS welcome_event_dedup (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_sent TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id)
      )
    `);
        const claim = await pool_1.pool.query(`INSERT INTO welcome_event_dedup (guild_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET last_sent = NOW()
       WHERE welcome_event_dedup.last_sent < NOW() - INTERVAL '60 seconds'
       RETURNING user_id`, [member.guild.id, member.id]);
        if (claim.rowCount === 0) {
            logger_1.logger.warn(`Duplicate welcome ignored for ${member.user.tag}`);
            return;
        }
        const channel = await client.channels.fetch('1566925496942596109');
        if (!channel || !channel.isTextBased() || !('send' in channel)) {
            logger_1.logger.error('Welcome channel is unavailable.');
            return;
        }
        const background = 'assets/welcome-background.png';
        tempDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'hollow-welcome-'));
        const avatarPath = (0, node_path_1.join)(tempDir, 'avatar.png');
        const maskPath = (0, node_path_1.join)(tempDir, 'mask.png');
        const circlePath = (0, node_path_1.join)(tempDir, 'avatar-circle.png');
        const framePath = (0, node_path_1.join)(tempDir, 'red-frame.png');
        const outputPath = (0, node_path_1.join)(tempDir, 'welcome.png');
        const avatarResponse = await fetch(member.user.displayAvatarURL({ extension: 'png', size: 512 }));
        if (!avatarResponse.ok) {
            throw new Error('Could not download member avatar.');
        }
        await (0, promises_1.writeFile)(avatarPath, Buffer.from(await avatarResponse.arrayBuffer()));
        const { stdout } = await execFileAsync('magick', [
            'identify', '-format', '%w %h', background
        ]);
        const [width, height] = stdout.trim().split(' ').map(Number);
        const size = Math.round(Math.min(width, height) * 0.27);
        const cx = Math.round(width / 2);
        const cy = Math.round(height * 0.49);
        const x = cx - Math.round(size / 2);
        const y = cy - Math.round(size / 2);
        const innerRadius = size / 2 + 10;
        const outerRadius = innerRadius + 28;
        const frameCommands = [];
        frameCommands.push(`circle ${cx},${cy} ${cx},${cy - innerRadius}`);
        for (let i = 0; i < 48; i++) {
            const angle = (Math.PI * 2 * i) / 48;
            const x1 = Math.round(cx + Math.cos(angle) * innerRadius);
            const y1 = Math.round(cy + Math.sin(angle) * innerRadius);
            const x2 = Math.round(cx + Math.cos(angle) * outerRadius);
            const y2 = Math.round(cy + Math.sin(angle) * outerRadius);
            frameCommands.push(`line ${x1},${y1} ${x2},${y2}`);
        }
        const frameDraw = frameCommands.join(' ');
        await execFileAsync('magick', [
            '-size', `${size}x${size}`,
            'xc:none',
            '-fill', 'white',
            '-draw', `circle ${size / 2},${size / 2} ${size / 2},0`,
            maskPath
        ]);
        await execFileAsync('magick', [
            avatarPath,
            '-resize', `${size}x${size}^`,
            '-gravity', 'center',
            '-extent', `${size}x${size}`,
            maskPath,
            '-alpha', 'off',
            '-compose', 'CopyOpacity',
            '-composite',
            circlePath
        ]);
        await execFileAsync('magick', [
            '-size', `${width}x${height}`,
            'xc:none',
            '-stroke', '#240006',
            '-strokewidth', '24',
            '-fill', 'none',
            '-draw', frameDraw,
            '-stroke', '#8b0015',
            '-strokewidth', '12',
            '-draw', frameDraw,
            '-stroke', '#d00028',
            '-strokewidth', '4',
            '-draw', frameDraw,
            framePath
        ]);
        const welcomeY = Math.round(height * 0.16);
        const usernameY = y + size + Math.round(height * 0.065);
        const welcomeSize = Math.round(width * 0.075);
        const usernameSize = Math.round(width * 0.042);
        await execFileAsync('magick', [
            background,
            framePath,
            '-compose', 'Over',
            '-composite',
            circlePath,
            '-geometry', `+${x}+${y}`,
            '-compose', 'Over',
            '-composite',
            '-gravity', 'North',
            '-font', 'DejaVu-Sans-Bold',
            '-kerning', '5',
            '-pointsize', String(welcomeSize),
            '-fill', '#a00018',
            '-stroke', '#170004',
            '-strokewidth', '8',
            '-annotate', `+0+${welcomeY}`, 'WELCOME',
            '-pointsize', String(usernameSize),
            '-kerning', '1',
            '-fill', '#f2e9eb',
            '-stroke', '#42000b',
            '-strokewidth', '5',
            '-annotate', `+0+${usernameY}`, `@${member.user.username}`,
            outputPath
        ]);
        await channel.send({
            content: `Welcome ${member}! Check out <#1566937138954772630> to always stay up to date with what's going on!`,
            files: [
                new discord_js_1.AttachmentBuilder(await (0, promises_1.readFile)(outputPath), {
                    name: 'hollow-welcome.png'
                })
            ]
        });
        logger_1.logger.info(`Welcome image sent for ${member.user.tag}`);
    }
    catch (error) {
        logger_1.logger.error('Failed to send welcome image', error);
    }
    finally {
        if (tempDir) {
            await (0, promises_1.rm)(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }
});
client.once(discord_js_1.Events.ClientReady, async (bot) => {
    logger_1.logger.info(`Logged in as ${bot.user.tag}`);
    logger_1.logger.info(`Connected guilds: ${bot.guilds.cache.size}`);
    const databaseOnline = await (0, pool_1.checkDatabase)();
    logger_1.logger.info(databaseOnline
        ? 'PostgreSQL connection established.'
        : 'PostgreSQL is unavailable.');
    logger_1.logger.info('Hollow Studio is operational.');
    const writeHeartbeat = async () => {
        try {
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
            const memberCount = bot.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0);
            await pool_1.pool.query(`
        INSERT INTO bot_telemetry (
          id, process_id, started_at, updated_at,
          discord_ping, guild_count, member_count
        )
        VALUES (1, $1, $2, NOW(), $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          started_at = CASE
            WHEN bot_telemetry.process_id <> EXCLUDED.process_id
            THEN EXCLUDED.started_at
            ELSE bot_telemetry.started_at
          END,
          process_id = EXCLUDED.process_id,
          updated_at = NOW(),
          discord_ping = EXCLUDED.discord_ping,
          guild_count = EXCLUDED.guild_count,
          member_count = EXCLUDED.member_count
      `, [
                process.pid,
                bot.readyAt || new Date(),
                Math.max(0, Math.round(bot.ws.ping)),
                bot.guilds.cache.size,
                memberCount
            ]);
        }
        catch (error) {
            logger_1.logger.error('Failed to update dashboard heartbeat', error);
        }
    };
    void writeHeartbeat();
    setInterval(() => {
        void writeHeartbeat();
    }, 15_000);
    void (0, service_1.syncRobloxMembers)(client);
    setInterval(() => {
        void (0, service_1.syncRobloxMembers)(client);
    }, 30 * 60 * 1000);
});
client.on(discord_js_1.Events.Error, error => {
    logger_1.logger.error('Discord client error', error);
});
async function start() {
    try {
        await (0, command_handler_1.loadCommands)(client);
        await client.login(token);
    }
    catch (error) {
        logger_1.logger.error('Startup failed', error);
        await pool_1.pool.end().catch(() => undefined);
        process.exit(1);
    }
}
process.on('unhandledRejection', reason => {
    logger_1.logger.error('Unhandled promise rejection', reason);
});
process.on('uncaughtException', error => {
    logger_1.logger.error('Uncaught exception', error);
});
start();
