import { EmbedBuilder, TextChannel } from 'discord.js';
import { pool } from '../database/pool';

const MODERATION_LOG_CHANNEL = '1567711062067904552';

export async function saveCase(
  guildId: string,
  userId: string,
  moderatorId: string,
  action: string,
  reason: string,
  duration?: number
) {
  await pool.query(
    `INSERT INTO moderation_cases
     (guild_id, user_id, moderator_id, action, reason, duration)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [guildId, userId, moderatorId, action, reason, duration ?? null]
  );

  await pool.query(
    `INSERT INTO audit_logs (guild_id, actor_id, action, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [guildId, moderatorId, action, userId, JSON.stringify({ reason, duration })]
  );
}

export async function logModeration(
  guild: any,
  action: string,
  userId: string,
  moderatorId: string,
  reason: string,
  duration?: number
) {
  const channel = await guild.channels.fetch(MODERATION_LOG_CHANNEL).catch(() => null);

  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    console.error('[MODERATION] Log channel unavailable or not text-based.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x8b0015)
    .setTitle(`Moderation • ${action.toUpperCase()}`)
    .addFields(
      { name: 'User', value: `<@${userId}> (\`${userId}\`)` },
      { name: 'Moderator', value: `<@${moderatorId}>` },
      { name: 'Reason', value: reason || 'No reason provided' }
    )
    .setTimestamp()
    .setFooter({ text: 'Hollow Studio Moderation' });

  if (duration !== undefined) {
    embed.addFields({
      name: 'Duration',
      value: duration > 0
        ? `${Math.round(duration / 60000)} minutes`
        : 'Permanent'
    });
  }

  await (channel as TextChannel).send({ embeds: [embed] }).catch(error => {
    console.error('[MODERATION LOG ERROR]', error);
  });
}

export async function recordModeration(
  guild: any,
  userId: string,
  moderatorId: string,
  action: string,
  reason: string,
  duration?: number
) {
  await saveCase(guild.id, userId, moderatorId, action, reason, duration);
  await logModeration(guild, action, userId, moderatorId, reason, duration);
}

export function parseDuration(input: string): number | null {
  const match = input.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isSafeInteger(amount) || amount < 1) return null;

  const multiplier = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  const duration = amount * multiplier;

  if (!Number.isSafeInteger(duration) || duration > 28 * 86400000) return null;

  return duration;
}

export function hasPermission(interaction: any, permission: bigint): boolean {
  return interaction.memberPermissions?.has(permission) ?? false;
}
