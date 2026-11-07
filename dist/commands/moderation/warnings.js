"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const pool_1 = require("../../database/pool");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View a member warning history')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
    async execute(interaction) {
        if (!interaction.guild)
            return;
        if (!(0, service_1.hasPermission)(interaction, discord_js_1.PermissionFlagsBits.ModerateMembers)) {
            await interaction.reply({
                content: 'You need the Moderate Members permission.',
                ephemeral: false
            });
            return;
        }
        const user = interaction.options.getUser('user', true);
        const result = await pool_1.pool.query(`SELECT id, reason, moderator_id, created_at
       FROM warnings
       WHERE guild_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 10`, [interaction.guild.id, user.id]);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x8b0015)
            .setTitle(`Warning History • ${user.tag}`)
            .setDescription(result.rows.length
            ? result.rows.map((row, i) => `**${i + 1}. Warning #${row.id}**\n` +
                `${row.reason}\n` +
                `Moderator: <@${row.moderator_id}>\n` +
                `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R>`).join('\n\n')
            : 'No warnings found.')
            .setFooter({ text: 'Use /unwarn with a warning ID to remove one.' });
        await interaction.reply({ embeds: [embed], ephemeral: false });
    }
};
exports.default = command;
