import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { recordModeration, hasPermission } from '../../moderation/service';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user using their Discord ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!hasPermission(interaction, PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: 'You need the Ban Members permission.', ephemeral: false });
      return;
    }

    const id = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!/^\d{17,20}$/.test(id)) {
      await interaction.reply({ content: 'Please provide a valid Discord ID.', ephemeral: false });
      return;
    }

    try {
      await interaction.guild.members.unban(id, reason);
      await recordModeration(interaction.guild, id, interaction.user.id, 'unban', reason);
      await interaction.reply({ content: `Successfully unbanned \`${id}\`.`, ephemeral: false });
    } catch {
      await interaction.reply({ content: 'Could not unban this user. They may not be banned.', ephemeral: false });
    }
  }
};

export default command;
