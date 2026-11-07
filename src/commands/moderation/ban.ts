import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { recordModeration, hasPermission } from '../../moderation/service';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban').setRequired(false)),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!hasPermission(interaction, PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: 'You need the Ban Members permission.', ephemeral: false });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (user.id === interaction.user.id) {
      await interaction.reply({ content: 'You cannot ban yourself.', ephemeral: false });
      return;
    }

    try {
      await interaction.guild.members.ban(user.id, { reason });
      await recordModeration(interaction.guild, user.id, interaction.user.id, 'ban', reason);
      await interaction.reply({ content: `Successfully banned **${user.tag}**.`, ephemeral: false });
    } catch {
      await interaction.reply({ content: 'Could not ban this user. Check my permissions and role hierarchy.', ephemeral: false });
    }
  }
};

export default command;
