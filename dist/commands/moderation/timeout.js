"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Temporarily timeout a member')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('Member to timeout').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('Examples: 10m, 2h, 1d (maximum 28d)').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        if (!interaction.guild)
            return;
        if (!(0, service_1.hasPermission)(interaction, discord_js_1.PermissionFlagsBits.ModerateMembers)) {
            await interaction.reply({ content: 'You need the Moderate Members permission.', ephemeral: false });
            return;
        }
        const user = interaction.options.getUser('user', true);
        const durationInput = interaction.options.getString('duration', true);
        const duration = (0, service_1.parseDuration)(durationInput);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (!duration) {
            await interaction.reply({ content: 'Invalid duration. Use 10m, 2h or 1d. Maximum: 28d.', ephemeral: false });
            return;
        }
        try {
            const member = await interaction.guild.members.fetch(user.id);
            if (!member.moderatable)
                throw new Error('Not moderatable');
            await member.timeout(duration, reason);
            await (0, service_1.recordModeration)(interaction.guild, user.id, interaction.user.id, 'timeout', reason, duration);
            await interaction.reply({ content: `**${user.tag}** has been timed out for ${durationInput}.`, ephemeral: false });
        }
        catch {
            await interaction.reply({ content: 'Could not timeout this user. Check my permissions and role hierarchy.', ephemeral: false });
        }
    }
};
exports.default = command;
