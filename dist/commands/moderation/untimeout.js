"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove a member timeout')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        if (!interaction.guild)
            return;
        if (!(0, service_1.hasPermission)(interaction, discord_js_1.PermissionFlagsBits.ModerateMembers)) {
            await interaction.reply({ content: 'You need the Moderate Members permission.', ephemeral: false });
            return;
        }
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        try {
            const member = await interaction.guild.members.fetch(user.id);
            if (!member.moderatable)
                throw new Error('Not moderatable');
            await member.timeout(null, reason);
            await (0, service_1.recordModeration)(interaction.guild, user.id, interaction.user.id, 'untimeout', reason);
            await interaction.reply({ content: `Timeout removed for **${user.tag}**.`, ephemeral: false });
        }
        catch {
            await interaction.reply({ content: 'Could not remove this timeout.', ephemeral: false });
        }
    }
};
exports.default = command;
