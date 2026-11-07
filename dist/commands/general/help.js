"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('help')
        .setDescription('Show Hollow Studio commands and features'),
    async execute(interaction) {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x63b9ff)
            .setTitle('Hollow Studio™')
            .setDescription('Central management system for the Hollow Studio community.')
            .addFields({ name: 'General', value: '`/ping` · Check bot latency\n`/help` · Show this message\n`/status` · System health' }, { name: 'Coming modules', value: 'Moderation · Roblox Verification · Tickets · Events · Statistics' })
            .setFooter({ text: 'Hollow Studio • Management System' });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
exports.default = command;
