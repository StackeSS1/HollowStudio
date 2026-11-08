import 'dotenv/config';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);
import {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder
} from 'discord.js';

import { loadCommands } from './handlers/command-handler';
import { checkDatabase, pool } from './database/pool';
import { logger } from './utils/logger';
import { syncRobloxMembers } from './roblox/service';
import { startDashboardServer } from './dashboard/server';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  logger.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});




client.on(Events.GuildMemberAdd, async member => {
  let tempDir = '';

  try {
    // AUTO ROLE: 1567125433089007727
    try {
      await member.roles.add(
        '1567125433089007727',
        'Automatic role for new members'
      );
      logger.info(`AutoRole assigned to ${member.user.tag}`);
    } catch (roleError) {
      logger.error(`Failed to assign AutoRole to ${member.user.tag}`, roleError);
    }
    // Prevent duplicate welcome messages for the same member.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS welcome_event_dedup (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_sent TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    const claim = await pool.query(
      `INSERT INTO welcome_event_dedup (guild_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET last_sent = NOW()
       WHERE welcome_event_dedup.last_sent < NOW() - INTERVAL '60 seconds'
       RETURNING user_id`,
      [member.guild.id, member.id]
    );

    if (claim.rowCount === 0) {
      logger.warn(`Duplicate welcome ignored for ${member.user.tag}`);
      return;
    }

    const channel = await client.channels.fetch('1566925496942596109');

    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      logger.error('Welcome channel is unavailable.');
      return;
    }

    const background = 'assets/welcome-background.png';
    tempDir = await mkdtemp(join(tmpdir(), 'hollow-welcome-'));

    const avatarPath = join(tempDir, 'avatar.png');
    const maskPath = join(tempDir, 'mask.png');
    const circlePath = join(tempDir, 'avatar-circle.png');
    const framePath = join(tempDir, 'red-frame.png');
    const outputPath = join(tempDir, 'welcome.png');

    const avatarResponse = await fetch(
      member.user.displayAvatarURL({ extension: 'png', size: 512 })
    );

    if (!avatarResponse.ok) {
      throw new Error('Could not download member avatar.');
    }

    await writeFile(avatarPath, Buffer.from(await avatarResponse.arrayBuffer()));

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

    frameCommands.push(
      `circle ${cx},${cy} ${cx},${cy - innerRadius}`
    );

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
        new AttachmentBuilder(await readFile(outputPath), {
          name: 'hollow-welcome.png'
        })
      ]
    });

    logger.info(`Welcome image sent for ${member.user.tag}`);
  } catch (error) {
    logger.error('Failed to send welcome image', error);
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
});

client.once(Events.ClientReady, async bot => {
  logger.info(`Logged in as ${bot.user.tag}`);
  logger.info(`Connected guilds: ${bot.guilds.cache.size}`);
  const databaseOnline = await checkDatabase();

  logger.info(
    databaseOnline
      ? 'PostgreSQL connection established.'
      : 'PostgreSQL is unavailable.'
  );

  logger.info('Hollow Studio is operational.');
  await startDashboardServer(client);

  const writeHeartbeat = async () => {
    try {
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

      const memberCount = bot.guilds.cache.reduce(
        (total, guild) => total + (guild.memberCount || 0),
        0
      );

      await pool.query(`
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
    } catch (error) {
      logger.error('Failed to update dashboard heartbeat', error);
    }
  };

  void writeHeartbeat();
  setInterval(() => {
    void writeHeartbeat();
  }, 15_000);

  void syncRobloxMembers(client);

  setInterval(() => {
    void syncRobloxMembers(client);
  }, 30 * 60 * 1000);
});

client.on(Events.Error, error => {
  logger.error('Discord client error', error);
});

async function start() {
  try {
    await loadCommands(client);
    await client.login(token);
  } catch (error) {
    logger.error('Startup failed', error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  }
}

process.on('unhandledRejection', reason => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', error => {
  logger.error('Uncaught exception', error);
});

start();
