"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for the ban').setRequired(false)),
    async execute(interaction) {
        if (!interaction.guild)
            return;
        if (!(0, service_1.hasPermission)(interaction, discord_js_1.PermissionFlagsBits.BanMembers)) {
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
            await (0, service_1.recordModeration)(interaction.guild, user.id, interaction.user.id, 'ban', reason);
            await interaction.reply({ content: `Successfully banned **${user.tag}**.`, ephemeral: false });
        }
        catch {
            await interaction.reply({ content: 'Could not ban this user. Check my permissions and role hierarchy.', ephemeral: false });
        }
    }
};
exports.default = command;
