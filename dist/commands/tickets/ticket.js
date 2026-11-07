"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const pool_1 = require("../../database/pool");
const interactions_1 = require("../../tickets/interactions");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Configure the Hollow Studio ticket system')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('setup')
        .setDescription('Create the ticket category and post the ticket panel')
        .addRoleOption(option => option.setName('staff_role')
        .setDescription('Role that can view and manage tickets')
        .setRequired(false))),
    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({
                content: 'This command can only be used inside a server.',
                ephemeral: true
            });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const guild = interaction.guild;
            const staffRole = interaction.options.getRole('staff_role');
            const category = await guild.channels.create({
                name: 'HOLLOW TICKETS',
                type: discord_js_1.ChannelType.GuildCategory,
                reason: 'Hollow Studio ticket system setup'
            });
            await pool_1.pool.query(`INSERT INTO guild_settings (guild_id, settings)
         VALUES ($1, jsonb_build_object(
           'tickets',
           jsonb_build_object(
             'categoryId', $2::text,
             'staffRoleId', $3::text
           )
         ))
         ON CONFLICT (guild_id)
         DO UPDATE SET
           settings = guild_settings.settings ||
             jsonb_build_object(
               'tickets',
               jsonb_build_object(
                 'categoryId', $2::text,
                 'staffRoleId', $3::text
               )
             ),
           updated_at = NOW()`, [guild.id, category.id, staffRole?.id ?? null]);
            const channel = interaction.channel;
            if (!channel || channel.type !== discord_js_1.ChannelType.GuildText) {
                await interaction.editReply('I cannot post the ticket panel in this channel.');
                return;
            }
            await (0, interactions_1.createTicketPanel)(channel);
            await interaction.editReply(`Ticket system configured successfully!\n\n` +
                `Category: **${category.name}**\n` +
                `Staff role: ${staffRole ? `<@&${staffRole.id}>` : '**Administrators only**'}\n` +
                `Panel posted in <#${channel.id}>.`);
        }
        catch (error) {
            console.error('[TICKET SETUP]', error);
            await interaction.editReply('Ticket setup failed. Check the bot permissions, especially Manage Channels.');
        }
    }
};
exports.default = command;
