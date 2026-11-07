import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  SnowflakeUtil
} from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = '1566925494975205537';

const defaultChannels = [
  '1567684209919791315', // Rules
  '1566937799540613130', // General
  '1566925496942596109', // Welcome
  '1567683877403623424', // Trailers
  '1567683749267644516', // Sneak Peeks
  '1567711336878575616', // Discord Updates
  '1567684354757361855'  // Choose Roles
];

const groups = [
  {
    title: 'What are you interested in?',
    description: 'Choose the topics you enjoy.',
    roles: [
      '🎮 Gaming',
      '💻 Development',
      '🎨 Design',
      '🎥 Content Creator',
      '🛠️ Other'
    ],
    mentionable: false
  },
  {
    title: 'Which notifications do you want?',
    description: 'Choose what you want to be notified about.',
    roles: [
      '📢 Announcements',
      '🎮 Game Updates',
      '🎁 Giveaways',
      '📊 Polls & Surveys',
      '📅 Events'
    ],
    mentionable: true
  }
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async bot => {
  try {
    const guild = await bot.guilds.fetch(GUILD_ID);
    const me = await guild.members.fetchMe();

    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('Bot is missing Manage Roles permission.');
    }

    if (!me.permissions.has(PermissionFlagsBits.ManageGuild)) {
      throw new Error('Bot is missing Manage Server permission.');
    }

    await guild.roles.fetch();
    await guild.channels.fetch();

    const roleIds: Record<string, string> = {};

    for (const group of groups) {
      for (const name of group.roles) {
        let role = guild.roles.cache.find(r => r.name === name);

        if (!role) {
          role = await guild.roles.create({
            name,
            color: 0x747F8D,
            hoist: false,
            mentionable: group.mentionable,
            permissions: [],
            reason: 'Native Discord Onboarding setup'
          });

          console.log(`[ROLE CREATED] ${name}: ${role.id}`);
        } else {
          console.log(`[ROLE EXISTS] ${name}: ${role.id}`);

          if (role.mentionable !== group.mentionable) {
            await role.setMentionable(
              group.mentionable,
              'Native Discord Onboarding configuration'
            );
          }
        }

        roleIds[name] = role.id;
      }
    }

    for (const id of defaultChannels) {
      const channel = guild.channels.cache.get(id);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Invalid default channel: ${id}`);
      }

      const permissions = channel.permissionsFor(guild.roles.everyone);

      if (
        !permissions?.has(PermissionFlagsBits.ViewChannel) ||
        !permissions?.has(PermissionFlagsBits.SendMessages)
      ) {
        throw new Error(`Default channel is not accessible: ${id}`);
      }
    }

    const prompts = groups.map(group => ({
      id: SnowflakeUtil.generate().toString(),
      title: group.title,
      description: group.description,
      type: 0,
      single_select: false,
      required: false,
      in_onboarding: true,
      options: group.roles.map(name => ({
        title: name,
        description: `Get the ${name} role.`,
        role_ids: [roleIds[name]],
        channel_ids: []
      }))
    }));

    const payload = {
      prompts,
      default_channel_ids: defaultChannels,
      enabled: true,
      mode: 0
    };

    console.log('\n[API] Sending native onboarding configuration...');

    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/onboarding`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[API ERROR] HTTP ${response.status}`);
      console.error(responseText);
      return;
    }

    const result = JSON.parse(responseText);

    console.log('\n[SUCCESS] Native Discord Onboarding configured!');
    console.log(`Enabled: ${result.enabled}`);
    console.log(`Prompts: ${result.prompts?.length ?? 0}`);
    console.log(`Default channels: ${result.default_channel_ids?.length ?? 0}`);
    console.log(`Mode: ${result.mode}`);
    console.log('\nFull response:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\n[SETUP FAILED]', error);
  } finally {
    await bot.destroy();
  }
});

client.login(TOKEN);
