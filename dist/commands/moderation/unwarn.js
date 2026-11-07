"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const pool_1 = require("../../database/pool");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Remove a warning from a member')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .addUserOption(option => option
        .setName('user')
        .setDescription('Member whose warning you want to remove')
        .setRequired(true)),
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
       ORDER BY created_at DESC
       LIMIT 25`, [interaction.guild.id, user.id]);
        if (!result.rows.length) {
            await interaction.reply({
                content: `**${user.tag}** has no active warnings.`,
                ephemeral: false
            });
            return;
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x8b0015)
            .setTitle('Hollow Studio • Remove Warning')
            .setDescription(`Select which warning you want to remove from ${user}.\n\n` +
            result.rows.map((warning) => `**#${warning.id}** — ${warning.reason || 'No reason provided'}\n` +
                `Moderator: <@${warning.moderator_id}>`).join('\n\n'))
            .setFooter({
            text: `Found ${result.rows.length} warning(s) • Select one below`
        })
            .setTimestamp();
        const menu = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId('unwarn_select')
            .setPlaceholder('Select a warning to remove...')
            .addOptions(result.rows.map((warning) => ({
            label: `Warning #${warning.id}`,
            description: (warning.reason || 'No reason provided').slice(0, 100),
            value: String(warning.id)
        })));
        const row = new discord_js_1.ActionRowBuilder()
            .addComponents(menu);
        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: false
        });
        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            time: 120_000,
            filter: component => component.user.id === interaction.user.id
        });
        collector.on('collect', async (component) => {
            if (!component.isStringSelectMenu())
                return;
            const warningId = component.values[0];
            const removed = await pool_1.pool.query(`DELETE FROM warnings
         WHERE id = $1 AND guild_id = $2 AND user_id = $3
         RETURNING reason`, [warningId, interaction.guild.id, user.id]);
            if (!removed.rowCount) {
                await component.update({
                    content: 'That warning no longer exists.',
                    embeds: [],
                    components: []
                });
                collector.stop();
                return;
            }
            const reason = removed.rows[0].reason || 'No reason provided';
            await (0, service_1.recordModeration)(interaction.guild, user.id, interaction.user.id, 'unwarn', `Removed warning #${warningId}: ${reason}`);
            const count = await pool_1.pool.query(`SELECT COUNT(*)::int AS total
         FROM warnings
         WHERE guild_id = $1 AND user_id = $2`, [interaction.guild.id, user.id]);
            const successEmbed = new discord_js_1.EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('Hollow Studio • Warning Removed')
                .setDescription(`Successfully removed warning **#${warningId}** from ${user}.\n\n` +
                `**Original reason:** ${reason}\n` +
                `**Remaining warnings:** ${count.rows[0].total}\n` +
                `**Removed by:** ${interaction.user}`)
                .setTimestamp();
            await component.update({
                content: 'Warning removed successfully. Confirmation sent to the moderation log channel.',
                embeds: [],
                components: []
            });
            const logChannel = await interaction.guild.channels
                .fetch('1567711062067904552')
                .catch(() => null);
            if (logChannel?.isTextBased() && 'send' in logChannel) {
                await logChannel.send({
                    embeds: [successEmbed]
                });
            }
            collector.stop();
        });
        collector.on('end', async () => {
            await interaction.editReply({
                components: []
            }).catch(() => { });
        });
    }
};
exports.default = command;
