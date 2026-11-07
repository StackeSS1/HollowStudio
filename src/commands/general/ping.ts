import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { HollowCommand } from '../../types/command';

const command: HollowCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check Hollow Studio response time'),

  async execute(interaction) {
    const latency = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setColor(0x63b9ff)
      .setTitle('Hollow Studio | Pong!')
      .addFields(
        { name: 'WebSocket latency', value: `${latency}ms`, inline: true },
        { name: 'API status', value: 'Operational', inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

export default command;
