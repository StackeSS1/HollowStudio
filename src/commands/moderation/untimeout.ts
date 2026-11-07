import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { recordModeration, hasPermission } from '../../moderation/service';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a member timeout')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),

  async execute(interaction) {
    if (!interaction.guild) return;
    if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({ content: 'You need the Moderate Members permission.', ephemeral: false });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (!member.moderatable) throw new Error('Not moderatable');

      await member.timeout(null, reason);
      await recordModeration(interaction.guild, user.id, interaction.user.id, 'untimeout', reason);
      await interaction.reply({ content: `Timeout removed for **${user.tag}**.`, ephemeral: false });
    } catch {
      await interaction.reply({ content: 'Could not remove this timeout.', ephemeral: false });
    }
  }
};

export default command;
