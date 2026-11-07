import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events
} from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const guildId = '1566925494975205537';

const roleNames = [
  '🎮 Gaming',
  '💻 Development',
  '🎨 Design',
  '🎥 Content Creator',
  '🛠️ Other',
  '📢 Announcements',
  '🎮 Game Updates',
  '🎁 Giveaways',
  '📊 Polls & Surveys',
  '📅 Events'
];

client.once(Events.ClientReady, async bot => {
  try {
    const guild = await bot.guilds.fetch(guildId);
    await guild.roles.fetch();

    for (const name of roleNames) {
      const role = guild.roles.cache.find(r => r.name === name);

      if (!role) {
        console.log(`[MISSING] ${name}`);
        continue;
      }

      await role.setPermissions([]);
      await role.setMentionable(false);
      await role.setHoist(false);

      console.log(`[COSMETIC] ${name}`);
    }

    console.log('\nAll available preference roles are now cosmetic.');
  } catch (error) {
    console.error('[ERROR]', error);
  } finally {
    await bot.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
