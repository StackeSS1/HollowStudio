import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { recordModeration, hasPermission } from '../../moderation/service';
import { pool } from '../../database/pool';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Warning reason').setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({ content: 'You need the Moderate Members permission.', ephemeral: false });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    if (user.id === interaction.user.id || user.bot) {
      await interaction.reply({ content: 'You cannot warn yourself or a bot.', ephemeral: false });
      return;
    }

    await pool.query(
      `INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
       VALUES ($1, $2, $3, $4)`,
      [interaction.guild.id, user.id, interaction.user.id, reason]
    );

    await recordModeration(interaction.guild, user.id, interaction.user.id, 'warn', reason);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM warnings WHERE guild_id = $1 AND user_id = $2`,
      [interaction.guild.id, user.id]
    );

    await interaction.reply({
      content: `⚠️ **${user.tag}** has been warned.\nReason: ${reason}\nTotal warnings: **${count.rows[0].total}**`,
      ephemeral: false
    });
  }
};

export default command;
