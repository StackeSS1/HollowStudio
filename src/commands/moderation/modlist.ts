import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import { HollowCommand } from '../../types/command';
import { hasPermission } from '../../moderation/service';
import { pool } from '../../database/pool';

type ListType = 'warnings' | 'bans' | 'mutes';

function formatDuration(ms: number | null, type: ListType): string {
  if (type === 'warnings') return 'N/A';
  if (type === 'bans' && !ms) return 'Permanent';
  if (!ms || ms <= 0) return 'Unknown';

  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  return parts.join(' ') || 'Less than 1 minute';
}

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('modlist')
    .setDescription('View server moderation lists')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Which moderation list to view')
        .setRequired(true)
        .addChoices(
          { name: 'Warnings', value: 'warnings' },
          { name: 'Bans', value: 'bans' },
          { name: 'Mutes', value: 'mutes' }
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) return;

    if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({
        content: 'You need the Moderate Members permission.',
        ephemeral: false
      });
      return;
    }

    const type = interaction.options.getString('type', true) as ListType;

    let result;

    if (type === 'warnings') {
      result = await pool.query(
        `SELECT id, user_id, moderator_id, reason, created_at, NULL::bigint AS duration
         FROM warnings
         WHERE guild_id = $1
         ORDER BY created_at DESC
         LIMIT 15`,
        [interaction.guild.id]
      );
    } else {
      const actions = type === 'bans'
        ? ['ban']
        : ['timeout', 'mute'];

      result = await pool.query(
        `SELECT id, user_id, moderator_id, reason, created_at, duration
         FROM moderation_cases
         WHERE guild_id = $1 AND action = ANY($2::text[])
         ORDER BY created_at DESC
         LIMIT 15`,
        [interaction.guild.id, actions]
      );
    }

    const titles: Record<ListType, string> = {
      warnings: 'Warning List',
      bans: 'Ban List',
      mutes: 'Mute List'
    };

    const entries = result.rows.map((row: any) => {
      const date = Math.floor(new Date(row.created_at).getTime() / 1000);
      const duration = formatDuration(
        row.duration === null ? null : Number(row.duration),
        type
      );

      return [
        `**#${row.id} • <@${row.user_id}>**`,
        `**Reason:** ${row.reason || 'No reason provided'}`,
        `**Duration:** ${duration}`,
        `**Moderator:** <@${row.moderator_id}>`,
        `**Date:** <t:${date}:R>`
      ].join('\n');
    });

    const embed = new EmbedBuilder()
      .setColor(0x8b0015)
      .setTitle(`Hollow Studio • ${titles[type]}`)
      .setDescription(
        entries.length
          ? entries.join('\n\n')
          : 'No records found.'
      )
      .setFooter({
        text: `Showing latest ${result.rows.length} records • Maximum 15`
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};

export default command;
