import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} from 'discord.js';

import { getRobloxConfig } from '../../roblox/service';

const data = new SlashCommandBuilder()
  .setName('roblox')
  .setDescription('Hollow Studio Roblox system')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub.setName('setup')
      .setDescription('Setup the Roblox verification panel')
  )
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('Check Roblox setup')
  );

async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used inside a Discord server.',
      ephemeral: true
    });
    return;
  }

  if (interaction.options.getSubcommand() === 'status') {
    const config = await getRobloxConfig(interaction.guild.id);

    await interaction.reply({
      content: config
        ? `Roblox Group: **${config.groupId}**\nRole: <@&${config.roleId}>`
        : 'The Roblox system has not been configured yet.',
      ephemeral: true
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('hollow:setup')
    .setTitle('Hollow Studio Roblox Setup');

  const groupInput = new TextInputBuilder()
    .setCustomId('group_id')
    .setLabel('Roblox Group ID or group URL')
    .setPlaceholder('Example: 12345678')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(150);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(groupInput)
  );

  await interaction.showModal(modal);
}

export default { data, execute };
