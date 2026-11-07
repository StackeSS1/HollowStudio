import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { HollowCommand } from '../../types/command';
import { checkDatabase } from '../../database/pool';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check Hollow Studio system health'),

  async execute(interaction) {
    await interaction.deferReply();

    const databaseOnline = await checkDatabase();
    const uptime = Math.floor(process.uptime());

    const embed = new EmbedBuilder()
      .setColor(databaseOnline ? 0x57d6a3 : 0xff6464)
      .setTitle('Hollow Studio | System Status')
      .addFields(
        { name: 'Discord', value: '🟢 Connected', inline: true },
        { name: 'PostgreSQL', value: databaseOnline ? '🟢 Connected' : '🔴 Offline', inline: true },
        { name: 'Uptime', value: `${uptime}s`, inline: true },
        { name: 'WebSocket', value: `${interaction.client.ws.ping}ms`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

export default command;
