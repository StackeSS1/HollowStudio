import 'dotenv/config';
import { Client, GatewayIntentBits, Events, PermissionFlagsBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const guildId = '1566925494975205537';

client.once(Events.ClientReady, async bot => {
  try {
    const guild = await bot.guilds.fetch(guildId);
    await guild.channels.fetch();

    console.log('\n===== CHANNEL VISIBILITY =====');

    for (const channel of guild.channels.cache
      .filter(c => c.isTextBased() && !c.isThread())
      .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0)).values()) {
      if (!('permissionsFor' in channel)) continue;

      const everyone = channel.permissionsFor(guild.roles.everyone);
      const visible = everyone?.has(PermissionFlagsBits.ViewChannel) ?? false;

      console.log(`${visible ? '[PUBLIC]' : '[RESTRICTED]'} ${channel.name} | ${channel.id}`);
    }

    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/onboarding`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
    );

    const data = await response.json() as any;

    console.log('\n===== ONBOARDING =====');
    console.log('Enabled:', data.enabled);
    console.log('Default channels:', data.default_channel_ids?.length);
    console.log('Default channel IDs:', data.default_channel_ids?.join(', '));
  } catch (error) {
    console.error(error);
  } finally {
    await bot.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
