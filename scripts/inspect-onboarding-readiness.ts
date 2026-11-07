import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async bot => {
  try {
    for (const guild of bot.guilds.cache.values()) {
      await guild.channels.fetch();
      await guild.roles.fetch();

      console.log(`\nSERVER: ${guild.name}`);
      console.log('DEFAULT CHANNEL CANDIDATES:\n');

      let eligible = 0;

      for (const channel of guild.channels.cache.values()) {
        if (
          channel.type !== ChannelType.GuildText &&
          channel.type !== ChannelType.GuildAnnouncement
        ) continue;

        const permissions = channel.permissionsFor(guild.roles.everyone);

        const canView = permissions?.has(PermissionFlagsBits.ViewChannel) ?? false;
        const canSend = permissions?.has(PermissionFlagsBits.SendMessages) ?? false;

        if (canView && canSend) eligible++;

        console.log(
          `${canView && canSend ? '[ELIGIBLE]' : '[NOT ELIGIBLE]'} ` +
          `${channel.name} | ${channel.id} | View: ${canView} | Send: ${canSend}`
        );
      }

      console.log(`\nELIGIBLE DEFAULT CHANNELS: ${eligible}`);
      console.log(`TOTAL ROLES: ${guild.roles.cache.size}`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    await bot.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
