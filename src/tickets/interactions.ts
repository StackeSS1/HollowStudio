import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';

import { pool } from '../database/pool';

type TicketInteraction = ButtonInteraction | ModalSubmitInteraction;

const categories: Record<string, string> = {
  support: 'Support',
  report: 'Report',
  partnership: 'Partnership'
};

async function getConfig(guildId: string) {
  const result = await pool.query(
    `SELECT settings->'tickets' AS config
     FROM guild_settings WHERE guild_id = $1`,
    [guildId]
  );

  return result.rows[0]?.config as {
    categoryId?: string;
    staffRoleId?: string | null;
  } | undefined;
}

function isStaff(interaction: TicketInteraction, roleId?: string | null) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return true;
  }

  const member = interaction.member;

  if (roleId && member && !Array.isArray(member) && 'roles' in member) {
    const roles = member.roles;
    return Array.isArray(roles) ? roles.includes(roleId) : roles.cache.has(roleId);
  }

  return false;
}

function controlRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('hollow:ticket:claim')
      .setLabel('Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('hollow:ticket:close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('hollow:ticket:add')
      .setLabel('Add Member')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('hollow:ticket:remove')
      .setLabel('Remove Member')
      .setStyle(ButtonStyle.Secondary)
  );
}

async function createTicket(interaction: ModalSubmitInteraction, type: string) {
  if (!interaction.guild) return;

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const config = await getConfig(guild.id);
  const reason = interaction.fields.getTextInputValue('reason').trim();

  if (!config?.categoryId) {
    await interaction.editReply('The ticket system has not been configured.');
    return;
  }

  const existing = await pool.query(
    `SELECT channel_id FROM tickets
     WHERE guild_id = $1 AND user_id = $2 AND status = 'open'
     LIMIT 1`,
    [guild.id, interaction.user.id]
  );

  if (existing.rows.length) {
    await interaction.editReply(
      `You already have an open ticket: <#${existing.rows[0].channel_id}>`
    );
    return;
  }

  const safeName = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 16) || 'user';

  const overwrites: any[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    }
  ];

  if (config.staffRoleId) {
    overwrites.push({
      id: config.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${type}-${safeName}`,
    type: ChannelType.GuildText,
    parent: config.categoryId,
    permissionOverwrites: overwrites,
    reason: `Ticket opened by ${interaction.user.tag}`
  });

  await pool.query(
    `INSERT INTO tickets (guild_id, channel_id, user_id, category, status)
     VALUES ($1, $2, $3, $4, 'open')`,
    [guild.id, channel.id, interaction.user.id, type]
  );

  const embed = new EmbedBuilder()
    .setColor(0x8b0015)
    .setTitle(`Hollow Studio • ${categories[type]} Ticket`)
    .setDescription([
      `Welcome ${interaction.user}!`,
      '',
      '**Your request:**',
      reason,
      '',
      'A staff member will assist you as soon as possible.'
    ].join('\n'))
    .setFooter({ text: 'Hollow Studio • Ticket Support' })
    .setTimestamp();

  await channel.send({
    content: `${interaction.user}`,
    embeds: [embed],
    components: [controlRow()]
  });

  await interaction.editReply(`Your ticket has been created: ${channel}`);
}

async function closeTicket(interaction: ButtonInteraction, channel: TextChannel) {
  if (!interaction.guild) return;

  const config = await getConfig(interaction.guild.id);

  if (!isStaff(interaction, config?.staffRoleId)) {
    await interaction.reply({
      content: 'Only staff members can close tickets.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const ticket = await pool.query(
    `SELECT * FROM tickets WHERE channel_id = $1 AND status = 'open'`,
    [channel.id]
  );

  if (!ticket.rows.length) {
    await interaction.editReply('This ticket is not open.');
    return;
  }

  const messages = await channel.messages.fetch({ limit: 100 });
  const transcriptText = [...messages.values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(message =>
      `[${message.createdAt.toISOString()}] ${message.author.tag}: ${message.content}`
    )
    .join('\n');

  const transcript = new AttachmentBuilder(
    Buffer.from(transcriptText || 'No messages.', 'utf8'),
    { name: `ticket-${channel.id}-transcript.txt` }
  );

  await channel.send({
    content: `Ticket closed by ${interaction.user}.`,
    files: [transcript],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('hollow:ticket:reopen')
          .setLabel('Reopen Ticket')
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('hollow:ticket:delete')
          .setLabel('Delete Ticket')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  });

  await pool.query(
    `UPDATE tickets SET status = 'closed', closed_at = NOW()
     WHERE channel_id = $1`,
    [channel.id]
  );

  const ownerId = ticket.rows[0].user_id;

  await channel.permissionOverwrites.edit(ownerId, {
    SendMessages: false
  });

  await channel.setName(`closed-${channel.name}`.slice(0, 100));

  await interaction.editReply('Ticket closed successfully.');
}

export async function handleTicketInteraction(
  interaction: TicketInteraction
): Promise<void> {
  if (!interaction.customId.startsWith('hollow:ticket:')) return;

  if (!interaction.guild) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: 'Tickets can only be used inside a server.',
        ephemeral: true
      });
    }
    return;
  }

  const parts = interaction.customId.split(':');
  const action = parts[2];

  if (interaction.isButton() && action === 'open') {
    const type = parts[3];

    if (!categories[type]) return;

    const modal = new ModalBuilder()
      .setCustomId(`hollow:ticket:reason:${type}`)
      .setTitle(`${categories[type]} Ticket`);

    const reason = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('How can we help you?')
      .setPlaceholder('Describe your request...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reason)
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && action === 'reason') {
    const type = parts[3];

    if (categories[type]) {
      await createTicket(interaction, type);
    }
    return;
  }

  if (!interaction.isButton()) {
    if (interaction.isModalSubmit() && (action === 'add' || action === 'remove')) {
      await interaction.deferReply({ ephemeral: true });

      const config = await getConfig(interaction.guild.id);

      if (!isStaff(interaction, config?.staffRoleId)) {
        await interaction.editReply('Only staff members can manage ticket access.');
        return;
      }

      const rawId = interaction.fields.getTextInputValue('user_id').trim();
      const userId = rawId.match(/\d{17,20}/)?.[0];

      if (!userId) {
        await interaction.editReply('Please enter a valid Discord user ID or mention.');
        return;
      }

      const channel = interaction.channel;

      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.editReply('This command must be used inside a ticket channel.');
        return;
      }

      const ticket = await pool.query(
        `SELECT * FROM tickets WHERE channel_id = $1 AND status = 'open'`,
        [channel.id]
      );

      if (!ticket.rows.length) {
        await interaction.editReply('This is not an open ticket.');
        return;
      }

      if (action === 'add') {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
        await interaction.editReply(`Added <@${userId}> to this ticket.`);
      } else {
        if (userId === ticket.rows[0].user_id) {
          await interaction.editReply('You cannot remove the ticket owner.');
          return;
        }

        await channel.permissionOverwrites.delete(userId).catch(() => undefined);
        await interaction.editReply(`Removed <@${userId}> from this ticket.`);
      }
    }
    return;
  }

  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'This button must be used inside a ticket channel.',
      ephemeral: true
    });
    return;
  }

  const config = await getConfig(interaction.guild.id);

  if (action === 'claim') {
    if (!isStaff(interaction, config?.staffRoleId)) {
      await interaction.reply({
        content: 'Only staff members can claim tickets.',
        ephemeral: true
      });
      return;
    }

    const result = await pool.query(
      `UPDATE tickets SET claimed_by = $1
       WHERE channel_id = $2 AND status = 'open'
       RETURNING id`,
      [interaction.user.id, channel.id]
    );

    if (!result.rows.length) {
      await interaction.reply({
        content: 'This ticket is not open.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `This ticket has been claimed by ${interaction.user}.`,
      allowedMentions: { users: [interaction.user.id] }
    });
    return;
  }

  if (action === 'close') {
    await closeTicket(interaction, channel);
    return;
  }

  if (action === 'reopen') {
    if (!isStaff(interaction, config?.staffRoleId)) {
      await interaction.reply({
        content: 'Only staff members can reopen tickets.',
        ephemeral: true
      });
      return;
    }

    const result = await pool.query(
      `SELECT * FROM tickets WHERE channel_id = $1 AND status = 'closed'`,
      [channel.id]
    );

    if (!result.rows.length) {
      await interaction.reply({
        content: 'This ticket is not closed.',
        ephemeral: true
      });
      return;
    }

    const ownerId = result.rows[0].user_id;

    await channel.permissionOverwrites.edit(ownerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    await pool.query(
      `UPDATE tickets SET status = 'open', closed_at = NULL
       WHERE channel_id = $1`,
      [channel.id]
    );

    await channel.setName(channel.name.replace(/^closed-/, '').slice(0, 100));

    await interaction.reply('Ticket reopened successfully.');
    await channel.send({
      content: `Ticket reopened by ${interaction.user}.`,
      components: [controlRow()]
    });
    return;
  }

  if (action === 'delete') {
    if (!isStaff(interaction, config?.staffRoleId)) {
      await interaction.reply({
        content: 'Only staff members can delete tickets.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: 'Are you sure you want to permanently delete this ticket channel?',
      ephemeral: true,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('hollow:ticket:confirm-delete')
            .setLabel('Yes, delete ticket')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('hollow:ticket:cancel-delete')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });
    return;
  }

  if (action === 'cancel-delete') {
    await interaction.update({
      content: 'Ticket deletion cancelled.',
      components: []
    });
    return;
  }

  if (action === 'confirm-delete') {
    if (!isStaff(interaction, config?.staffRoleId)) {
      await interaction.reply({
        content: 'Only staff members can delete tickets.',
        ephemeral: true
      });
      return;
    }

    const result = await pool.query(
      `UPDATE tickets SET status = 'deleted'
       WHERE channel_id = $1 AND status = 'closed'
       RETURNING id`,
      [channel.id]
    );

    if (!result.rows.length) {
      await interaction.reply({
        content: 'This ticket must be closed before it can be deleted.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: 'Ticket deleted. Its database history has been preserved.',
      ephemeral: true
    });

    await channel.delete(`Ticket deleted by ${interaction.user.tag}`);
    return;
  }

  if (action === 'add' || action === 'remove') {
    if (!isStaff(interaction, config?.staffRoleId)) {
      await interaction.reply({
        content: 'Only staff members can manage ticket access.',
        ephemeral: true
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`hollow:ticket:${action}`)
      .setTitle(action === 'add' ? 'Add Ticket Member' : 'Remove Ticket Member');

    const userInput = new TextInputBuilder()
      .setCustomId('user_id')
      .setLabel('Discord user ID or mention')
      .setPlaceholder('Enter the user ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(userInput)
    );

    await interaction.showModal(modal);
  }
}

export async function createTicketPanel(
  channel: import('discord.js').TextChannel
) {
  const embed = new EmbedBuilder()
    .setColor(0x8b0015)
    .setTitle('Hollow Studio • Support Center')
    .setDescription([
      'Welcome to Hollow Studio support.',
      '',
      'Select a category below to open a private ticket.',
      '',
      '🎫 **Support** — General questions and assistance.',
      '🚨 **Report** — Report an issue or a user.',
      '🤝 **Partnership** — Business and partnership inquiries.'
    ].join('\n'))
    .setFooter({ text: 'Hollow Studio • Ticket System' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('hollow:ticket:open:support')
      .setLabel('Support')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('hollow:ticket:open:report')
      .setLabel('Report')
      .setEmoji('🚨')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('hollow:ticket:open:partnership')
      .setLabel('Partnership')
      .setEmoji('🤝')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}
