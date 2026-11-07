"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const service_1 = require("../../moderation/service");
const pool_1 = require("../../database/pool");
const categories = {
    bans: {
        label: 'Bans',
        actions: ['ban']
    },
    unbans: {
        label: 'Unbans',
        actions: ['unban']
    },
    mute: {
        label: 'Mute',
        actions: ['timeout', 'mute']
    },
    unmute: {
        label: 'Unmute',
        actions: ['untimeout', 'unmute']
    },
    warn: {
        label: 'Warn',
        actions: ['warn']
    },
    unwarn: {
        label: 'Unwarn',
        actions: ['unwarn']
    }
};
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('history')
        .setDescription('View a member moderation history')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ModerateMembers)
        .addUserOption(option => option
        .setName('user')
        .setDescription('Member whose history you want to view')
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
        const menu = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId('history_category')
            .setPlaceholder('Choose a moderation category...')
            .addOptions(Object.entries(categories).map(([value, category]) => ({
            label: category.label,
            value
        })));
        const row = new discord_js_1.ActionRowBuilder()
            .addComponents(menu);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x8b0015)
            .setTitle('Hollow Studio • Moderation History')
            .setThumbnail(user.displayAvatarURL())
            .setDescription(`**Member:** ${user}\n` +
            `**User ID:** \`${user.id}\`\n\n` +
            'Choose a category below to view moderation records.')
            .setFooter({ text: 'Hollow Studio Moderation System' })
            .setTimestamp();
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
            const selected = component.values[0];
            const category = categories[selected];
            if (!category)
                return;
            const result = await pool_1.pool.query(`SELECT id, action, reason, moderator_id, duration, created_at
         FROM moderation_cases
         WHERE guild_id = $1
           AND user_id = $2
           AND action = ANY($3::text[])
         ORDER BY created_at DESC
         LIMIT 15`, [interaction.guild.id, user.id, category.actions]);
            const entries = result.rows.map((record) => {
                const date = Math.floor(new Date(record.created_at).getTime() / 1000);
                const duration = Number(record.duration || 0);
                let formattedDuration = 'N/A';
                if (record.action === 'ban' && !duration) {
                    formattedDuration = 'Permanent';
                }
                else if (duration > 0) {
                    const days = Math.floor(duration / 86400000);
                    const hours = Math.floor((duration % 86400000) / 3600000);
                    const minutes = Math.floor((duration % 3600000) / 60000);
                    const parts = [];
                    if (days)
                        parts.push(`${days}d`);
                    if (hours)
                        parts.push(`${hours}h`);
                    if (minutes)
                        parts.push(`${minutes}m`);
                    formattedDuration = parts.join(' ') || 'Less than 1 minute';
                }
                return [
                    `**#${record.id} • ${record.action.toUpperCase()}**`,
                    `**Reason:** ${(record.reason || 'No reason provided').slice(0, 250)}`,
                    `**Moderator:** <@${record.moderator_id}>`,
                    `**Duration:** ${formattedDuration}`,
                    `**Date:** <t:${date}:R>`
                ].join('\n');
            });
            const historyEmbed = new discord_js_1.EmbedBuilder()
                .setColor(0x8b0015)
                .setTitle(`Hollow Studio • ${category.label}`)
                .setThumbnail(user.displayAvatarURL())
                .setDescription(`**Member:** ${user}\n\n` +
                (entries.length
                    ? entries.join('\n\n')
                    : 'No records found in this category.'))
                .setFooter({
                text: `Showing ${result.rows.length} records • Maximum 15`
            })
                .setTimestamp();
            await component.update({
                embeds: [historyEmbed],
                components: [row]
            });
        });
        collector.on('end', async () => {
            await interaction.editReply({
                components: []
            }).catch(() => { });
        });
    }
};
exports.default = command;
