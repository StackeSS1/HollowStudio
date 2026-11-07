import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { hasPermission } from '../../moderation/service';
import { pool } from '../../database/pool';
import { EmbedBuilder } from 'discord.js';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages from this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: 'You need the Manage Messages permission.', ephemeral: false });
      return;
    }

    if (!interaction.channel || !interaction.channel.isTextBased() || !('bulkDelete' in interaction.channel)) {
      await interaction.reply({ content: 'This command can only be used in a text channel.', ephemeral: false });
      return;
    }

    const amount = interaction.options.getInteger('amount', true);

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);

      await pool.query(
        `INSERT INTO audit_logs (guild_id, actor_id, action, metadata)
         VALUES ($1, $2, 'clear', $3)`,
        [interaction.guild.id, interaction.user.id, JSON.stringify({ channelId: interaction.channel.id, amount: deleted.size })]
      );

      const logChannel = await interaction.guild.channels.fetch('1567711062067904552').catch(() => null);

      if (logChannel?.isTextBased() && 'send' in logChannel) {
        const embed = new EmbedBuilder()
          .setColor(0x8b0015)
          .setTitle('Moderation • CLEAR')
          .addFields(
            { name: 'Moderator', value: `${interaction.user} (\`${interaction.user.id}\`)` },
            { name: 'Channel', value: `<#${interaction.channel.id}>` },
            { name: 'Deleted Messages', value: String(deleted.size) }
          )
          .setTimestamp()
          .setFooter({ text: 'Hollow Studio Moderation' });

        await logChannel.send({ embeds: [embed] }).catch(console.error);
      }

      await interaction.reply({ content: `Deleted **${deleted.size}** messages.`, ephemeral: false });
    } catch {
      await interaction.reply({ content: 'Could not delete messages.', ephemeral: false });
    }
  }
};

export default command;
