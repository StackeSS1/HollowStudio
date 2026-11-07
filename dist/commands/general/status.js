"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const pool_1 = require("../../database/pool");
const command = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('status')
        .setDescription('Check Hollow Studio system health'),
    async execute(interaction) {
        await interaction.deferReply();
        const databaseOnline = await (0, pool_1.checkDatabase)();
        const uptime = Math.floor(process.uptime());
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(databaseOnline ? 0x57d6a3 : 0xff6464)
            .setTitle('Hollow Studio | System Status')
            .addFields({ name: 'Discord', value: '🟢 Connected', inline: true }, { name: 'PostgreSQL', value: databaseOnline ? '🟢 Connected' : '🔴 Offline', inline: true }, { name: 'Uptime', value: `${uptime}s`, inline: true }, { name: 'WebSocket', value: `${interaction.client.ws.ping}ms`, inline: true })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
};
exports.default = command;
