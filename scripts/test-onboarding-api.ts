import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits
} from 'discord.js';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async bot => {
  console.log(`Connected as ${bot.user.tag}`);
  console.log('Testing native Discord Onboarding API...\n');

  for (const guild of bot.guilds.cache.values()) {
    const me = guild.members.me;
    const canManageGuild = me?.permissions.has(
      PermissionFlagsBits.ManageGuild
    ) ?? false;

    console.log(`SERVER: ${guild.name}`);
    console.log(`SERVER ID: ${guild.id}`);
    console.log(`COMMUNITY: ${guild.features.includes('COMMUNITY')}`);
    console.log(`BOT HAS MANAGE_GUILD: ${canManageGuild}`);

    try {
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${guild.id}/onboarding`,
        {
          headers: {
            Authorization: `Bot ${token}`
          }
        }
      );

      console.log(`ONBOARDING API STATUS: ${response.status}`);

      const body = await response.text();

      if (response.ok) {
        console.log('RESULT: API ACCESS SUCCESSFUL!');
        console.log('CURRENT ONBOARDING CONFIGURATION:');
        console.log(JSON.stringify(JSON.parse(body), null, 2));
      } else {
        console.log('API RESPONSE:');
        console.log(body);
      }
    } catch (error) {
      console.error('REQUEST ERROR:', error);
    }

    console.log('\n-----------------------------\n');
  }

  await client.destroy();
});

client.login(token);
