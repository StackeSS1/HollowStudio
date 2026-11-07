"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const pool_1 = require("../../database/pool");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a member')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Warning reason').setRequired(true)),
    async execute(interaction) {
        if (!interaction.guild)
            return;
        if (!(0, service_1.hasPermission)(interaction, discord_js_1.PermissionFlagsBits.ModerateMembers)) {
            await interaction.reply({ content: 'You need the Moderate Members permission.', ephemeral: false });
            return;
        }
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true);
        if (user.id === interaction.user.id || user.bot) {
            await interaction.reply({ content: 'You cannot warn yourself or a bot.', ephemeral: false });
            return;
        }
        await pool_1.pool.query(`INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
       VALUES ($1, $2, $3, $4)`, [interaction.guild.id, user.id, interaction.user.id, reason]);
        await (0, service_1.recordModeration)(interaction.guild, user.id, interaction.user.id, 'warn', reason);
        const count = await pool_1.pool.query(`SELECT COUNT(*)::int AS total FROM warnings WHERE guild_id = $1 AND user_id = $2`, [interaction.guild.id, user.id]);
        await interaction.reply({
            content: `⚠️ **${user.tag}** has been warned.\nReason: ${reason}\nTotal warnings: **${count.rows[0].total}**`,
            ephemeral: false
        });
    }
};
exports.default = command;
