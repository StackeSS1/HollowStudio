import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { hasPermission } from '../../moderation/service';
import { pool } from '../../database/pool';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View a member warning history')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('user').setDescription('Member').setRequired(true)
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

    const user = interaction.options.getUser('user', true);

    const result = await pool.query(
      `SELECT id, reason, moderator_id, created_at
       FROM warnings
       WHERE guild_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 10`,
      [interaction.guild.id, user.id]
    );

    const embed = new EmbedBuilder()
      .setColor(0x8b0015)
      .setTitle(`Warning History • ${user.tag}`)
      .setDescription(
        result.rows.length
          ? result.rows.map((row, i) =>
              `**${i + 1}. Warning #${row.id}**\n` +
              `${row.reason}\n` +
              `Moderator: <@${row.moderator_id}>\n` +
              `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R>`
            ).join('\n\n')
          : 'No warnings found.'
      )
      .setFooter({ text: 'Use /unwarn with a warning ID to remove one.' });

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};

export default command;
