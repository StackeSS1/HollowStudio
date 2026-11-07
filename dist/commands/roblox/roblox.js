"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../roblox/service");
const data = new discord_js_1.SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Hollow Studio Roblox system')
    .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('setup')
    .setDescription('Setup the Roblox verification panel'))
    .addSubcommand(sub => sub.setName('status')
    .setDescription('Check Roblox setup'));
async function execute(interaction) {
    if (!interaction.guild) {
        await interaction.reply({
            content: 'This command can only be used inside a Discord server.',
            ephemeral: true
        });
        return;
    }
    if (interaction.options.getSubcommand() === 'status') {
        const config = await (0, service_1.getRobloxConfig)(interaction.guild.id);
        await interaction.reply({
            content: config
                ? `Roblox Group: **${config.groupId}**\nRole: <@&${config.roleId}>`
                : 'The Roblox system has not been configured yet.',
            ephemeral: true
        });
        return;
    }
    const modal = new discord_js_1.ModalBuilder()
        .setCustomId('hollow:setup')
        .setTitle('Hollow Studio Roblox Setup');
    const groupInput = new discord_js_1.TextInputBuilder()
        .setCustomId('group_id')
        .setLabel('Roblox Group ID or group URL')
        .setPlaceholder('Example: 12345678')
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(150);
    modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(groupInput));
    await interaction.showModal(modal);
}
exports.default = { data, execute };
