import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { recordModeration, hasPermission } from '../../moderation/service';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!hasPermission(interaction, PermissionFlagsBits.KickMembers)) {
      await interaction.reply({ content: 'You need the Kick Members permission.', ephemeral: false });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (!member.kickable) throw new Error('Not kickable');

      await member.kick(reason);
      await recordModeration(interaction.guild, user.id, interaction.user.id, 'kick', reason);
      await interaction.reply({ content: `Successfully kicked **${user.tag}**.`, ephemeral: false });
    } catch {
      await interaction.reply({ content: 'Could not kick this user. Check my permissions and role hierarchy.', ephemeral: false });
    }
  }
};

export default command;
