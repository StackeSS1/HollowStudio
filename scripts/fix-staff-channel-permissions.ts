import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits
} from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const guildId = '1566925494975205537';

const staffChannels = [
  { name: 'staff-chat', id: '1566938449523773541' },
  { name: 'moderation-logs', id: '1567711062067904552' },
  { name: 'staff-reports', id: '1567711152413081710' }
];

const publicChannels = [
  { name: 'Private 1', id: '1566938297517744158' },
  { name: 'Private 2', id: '1566938315586928773' },
  { name: 'Private 3', id: '1566938335048503397' }
];

client.once(Events.ClientReady, async bot => {
  try {
    const guild = await bot.guilds.fetch(guildId);
    await guild.channels.fetch();

    for (const item of staffChannels) {
      const channel = guild.channels.cache.get(item.id);

      if (!channel || !channel.isTextBased() || !('permissionOverwrites' in channel)) {
        console.log(`[ERROR] Cannot find ${item.name}`);
        continue;
      }

      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        { ViewChannel: false },
        { reason: 'Restrict staff channel to staff roles' }
      );

      console.log(`[STAFF ONLY] ${item.name}`);

      for (const overwrite of channel.permissionOverwrites.cache.values()) {
        if (overwrite.type === 0 && overwrite.id !== guild.id) {
          console.log(`  Existing role overwrite preserved: ${overwrite.id}`);
        }
      }
    }

    for (const item of publicChannels) {
      const channel = guild.channels.cache.get(item.id);

      if (!channel || !('permissionOverwrites' in channel)) {
        console.log(`[ERROR] Cannot find ${item.name}`);
        continue;
      }

      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        { ViewChannel: true },
        { reason: 'Keep this channel public' }
      );

      console.log(`[PUBLIC] ${item.name}`);
    }

    console.log('\n[COMPLETE] Channel visibility updated.');
  } catch (error) {
    console.error('[ERROR]', error);
  } finally {
    await bot.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
