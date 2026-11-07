"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user using their Discord ID')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.BanMembers)
        .addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        if (!interaction.guild)
            return;
        if (!(0, service_1.hasPermission)(interaction, discord_js_1.PermissionFlagsBits.BanMembers)) {
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
            await (0, service_1.recordModeration)(interaction.guild, id, interaction.user.id, 'unban', reason);
            await interaction.reply({ content: `Successfully unbanned \`${id}\`.`, ephemeral: false });
        }
        catch {
            await interaction.reply({ content: 'Could not unban this user. They may not be banned.', ephemeral: false });
        }
    }
};
exports.default = command;
