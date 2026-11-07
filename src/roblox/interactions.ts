import {
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder
} from 'discord.js';

import { pool } from '../database/pool';

import {
  getRobloxConfig,
  getRobloxUser,
  isRobloxGroupMember,
  getRobloxDescription,
  giveHollowRole
} from './service';

type RobloxInteraction = ButtonInteraction | ModalSubmitInteraction;

export async function handleRobloxInteraction(
  interaction: RobloxInteraction
): Promise<void> {
  if (!interaction.customId.startsWith('hollow:')) return;

  if (!interaction.guild) {
    await interaction.reply({
      content: 'This system can only be used inside a Discord server.',
      ephemeral: true
    });
    return;
  }

  // ADMIN SETUP
  if (
    interaction.isModalSubmit() &&
    interaction.customId === 'hollow:setup'
  ) {
    if (!interaction.memberPermissions?.has('ManageGuild')) {
      await interaction.reply({
        content: 'Only administrators can configure the Roblox system.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const raw = interaction.fields.getTextInputValue('group_id').trim();
      const groupId = raw.match(/\d+/)?.[0];

      if (!groupId) {
        await interaction.editReply('Please enter a valid Roblox Group ID or group URL.');
        return;
      }

      const response = await fetch(
        `https://groups.roblox.com/v1/groups/${groupId}`
      );

      if (!response.ok) {
        await interaction.editReply(
          'Roblox group not found. Please check the group URL or ID.'
        );
        return;
      }

      const group = await response.json() as { name: string };

      let role = interaction.guild.roles.cache.find(
        item => item.name === 'Hollow Guy'
      );

      if (!role) {
        role = await interaction.guild.roles.create({
          name: 'Hollow Guy',
          reason: 'Hollow Studio Roblox verification'
        });
      }

      await pool.query(
        `INSERT INTO guild_settings (guild_id, settings)
         VALUES (
           $1,
           jsonb_build_object(
             'roblox',
             jsonb_build_object(
               'groupId', $2::text,
               'roleId', $3::text
             )
           )
         )
         ON CONFLICT (guild_id)
         DO UPDATE SET
           settings = guild_settings.settings ||
             jsonb_build_object(
               'roblox',
               jsonb_build_object(
                 'groupId', $2::text,
                 'roleId', $3::text
               )
             ),
           updated_at = NOW()`,
        [interaction.guild.id, groupId, role.id]
      );

      const embed = new EmbedBuilder()
        .setColor(0x55aaff)
        .setTitle('❄️ HOLLOW STUDIO')
        .setDescription([
          '# Roblox Account Verification',
          '',
          'Connect your Roblox account to Discord to verify that you are a member of our Roblox group.',
          '',
          '**How does it work?**',
          '1. Click the button below.',
          '2. Enter your Roblox username.',
          '3. Follow the simple instructions.',
          '4. Receive the **Hollow Guy** role!',
          '',
          'If you are not a member of our Roblox group, join it first.'
        ].join('\n'))
        .setFooter({
          text: 'Hollow Studio • Official Verification System'
        })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setCustomId('hollow:verify')
        .setLabel('Verify Roblox Account')
        .setEmoji('🔐')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(button);

      const channel = interaction.channel;

      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        await interaction.editReply(
          'I cannot send the panel to this channel.'
        );
        return;
      }

      await channel.send({
        embeds: [embed],
        components: [row]
      });

      await interaction.editReply(
        `**Roblox system configured successfully!**\n\n` +
        `Group: **${group.name}**\n` +
        `Role: **Hollow Guy**\n\n` +
        'The verification panel has been posted in this channel.'
      );
    } catch (error) {
      console.error('[ROBLOX SETUP]', error);

      await interaction.editReply(
        'Setup failed. Make sure the bot has Manage Roles permission and that its highest role is above Hollow Guy.'
      );
    }

    return;
  }

  // VERIFY BUTTON
  if (
    interaction.isButton() &&
    interaction.customId === 'hollow:verify'
  ) {
    const modal = new ModalBuilder()
      .setCustomId('hollow:username')
      .setTitle('Connect Roblox Account');

    const username = new TextInputBuilder()
      .setCustomId('username')
      .setLabel('Your Roblox username')
      .setPlaceholder('Enter your Roblox username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(username)
    );

    await interaction.showModal(modal);
    return;
  }

  // USERNAME SUBMISSION
  if (
    interaction.isModalSubmit() &&
    interaction.customId === 'hollow:username'
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const config = await getRobloxConfig(interaction.guild.id);

      if (!config) {
        await interaction.editReply('Roblox verification has not been configured.');
        return;
      }

      const username = interaction.fields
        .getTextInputValue('username')
        .trim();

      const user = await getRobloxUser(username);

      if (!user) {
        await interaction.editReply(
          'Roblox profile not found. Please check the username.'
        );
        return;
      }

      const belongs = await isRobloxGroupMember(
        user.id,
        config.groupId
      );

      if (!belongs) {
        await interaction.editReply(
          'You are not a member of the Hollow Studio Roblox group. Join the group and try again!'
        );
        return;
      }

      const code =
        `HOLLOW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      await pool.query(
        `INSERT INTO pending_roblox_verifications
          (discord_id, guild_id, roblox_id, roblox_username, verification_code, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '15 minutes')
         ON CONFLICT (discord_id)
         DO UPDATE SET
           guild_id = EXCLUDED.guild_id,
           roblox_id = EXCLUDED.roblox_id,
           roblox_username = EXCLUDED.roblox_username,
           verification_code = EXCLUDED.verification_code,
           expires_at = EXCLUDED.expires_at,
           created_at = NOW()`,
        [
          interaction.user.id,
          interaction.guild.id,
          user.id,
          user.name,
          code
        ]
      );

      const confirmButton = new ButtonBuilder()
        .setCustomId('hollow:confirm')
        .setLabel('I Added the Code')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton);

      await interaction.editReply({
        content:
          `**Your Roblox profile has been found!**\n\n` +
          `Roblox username: **${user.name}**\n\n` +
          `**Just one more step:**\n` +
          `1. Open your Roblox profile.\n` +
          `2. Copy this code into your About / Description section:\n\n` +
          `\`${code}\`\n\n` +
          `3. Save your changes.\n` +
          `4. Return here and click the button below.\n\n` +
          `This code expires in 15 minutes.`,
        components: [row]
      });
    } catch (error) {
      console.error('[ROBLOX USERNAME]', error);

      await interaction.editReply(
        'Unable to verify your Roblox profile. Please try again later.'
      );
    }

    return;
  }

  // CONFIRM BUTTON
  if (
    interaction.isButton() &&
    interaction.customId === 'hollow:confirm'
  ) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const config = await getRobloxConfig(interaction.guild.id);

      if (!config) {
        await interaction.editReply('The Roblox system has not been configured.');
        return;
      }

      const result = await pool.query(
        `SELECT * FROM pending_roblox_verifications
         WHERE discord_id = $1
           AND guild_id = $2
           AND expires_at > NOW()`,
        [interaction.user.id, interaction.guild.id]
      );

      if (!result.rows.length) {
        await interaction.editReply(
          'Your verification has expired. Click Verify Roblox Account to start again.'
        );
        return;
      }

      const account = result.rows[0];

      const belongs = await isRobloxGroupMember(
        Number(account.roblox_id),
        config.groupId
      );

      if (!belongs) {
        await interaction.editReply(
          'You are no longer a member of the Roblox group. Rejoin the group and try again.'
        );
        return;
      }

      const description = await getRobloxDescription(
        Number(account.roblox_id)
      );

      if (!description.includes(account.verification_code)) {
        await interaction.editReply(
          'I could not find the code on your Roblox profile. Make sure you saved your changes.'
        );
        return;
      }

      const member = await interaction.guild.members.fetch(
        interaction.user.id
      );

      await giveHollowRole(member, config.roleId);

      await pool.query(
        `INSERT INTO roblox_accounts
          (discord_id, roblox_id, roblox_username, guild_id, group_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (discord_id)
         DO UPDATE SET
           roblox_id = EXCLUDED.roblox_id,
           roblox_username = EXCLUDED.roblox_username,
           guild_id = EXCLUDED.guild_id,
           group_id = EXCLUDED.group_id,
           verified_at = NOW()`,
        [
          interaction.user.id,
          account.roblox_id,
          account.roblox_username,
          interaction.guild.id,
          config.groupId
        ]
      );

      await pool.query(
        'DELETE FROM pending_roblox_verifications WHERE discord_id = $1',
        [interaction.user.id]
      );

      await pool.query(
        `INSERT INTO audit_logs
          (guild_id, actor_id, action, target_id, metadata)
         VALUES ($1, NULL, 'roblox_verified', $2, $3::jsonb)`,
        [
          interaction.guild.id,
          interaction.user.id,
          JSON.stringify({
            robloxId: account.roblox_id,
            robloxUsername: account.roblox_username,
            groupId: config.groupId,
            roleId: config.roleId
          })
        ]
      ).catch(error => console.error('[ROBLOX AUDIT]', error));

      await interaction.editReply(
        `🎉 **Verification successful!**\n\n` +
        `Roblox: **${account.roblox_username}**\n` +
        `Discord role: **Hollow Guy**\n\n` +
        'Welcome to Hollow Studio!'
      );
    } catch (error) {
      console.error('[ROBLOX CONFIRM]', error);

      await interaction.editReply(
        "Verification failed. Check the bot permissions and try again."
      );
    }
  }
}
