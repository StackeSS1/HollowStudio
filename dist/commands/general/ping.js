"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check Hollow Studio response time'),
    async execute(interaction) {
        const latency = interaction.client.ws.ping;
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(0x63b9ff)
            .setTitle('Hollow Studio | Pong!')
            .addFields({ name: 'WebSocket latency', value: `${latency}ms`, inline: true }, { name: 'API status', value: 'Operational', inline: true })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
};
exports.default = command;
