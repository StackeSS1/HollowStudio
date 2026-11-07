"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('suggestions')
        .setDescription('Configure the Hollow Studios suggestions system')
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub
        .setName('setup')
        .setDescription('Post the suggestions panel in this channel')),
    async execute(interaction) {
        if (!interaction.guild) {
            await interaction.reply({
                content: 'This command can only be used inside a server.',
                ephemeral: true
            });
            return;
        }
        const channel = interaction.channel;
        if (!channel || channel.type !== discord_js_1.ChannelType.GuildText) {
            await interaction.reply({
                content: 'Please use this command in a text channel.',
                ephemeral: true
            });
            return;
        }
        await interaction.deferReply({ ephemeral: true });
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x16090D)
            .setTitle('💡 Hollow Studios | Suggestions')
            .setDescription('Have an idea that could improve Hollow Studios?\n\n' +
            'Click the button below to submit your suggestion. ' +
            'The community can vote **For** or **Against** each suggestion.')
            .setFooter({ text: 'Hollow Studios • Community Suggestions' });
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('hollow:suggestions:new')
            .setLabel('New Suggestion')
            .setEmoji('✏️')
            .setStyle(discord_js_1.ButtonStyle.Danger));
        await channel.send({
            embeds: [embed],
            components: [row]
        });
        await interaction.editReply(`Suggestions panel successfully posted in <#${channel.id}>.`);
    }
};
exports.default = command;
