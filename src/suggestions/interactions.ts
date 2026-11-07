import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  LabelBuilder,
  ChannelType,
  ButtonInteraction,
  ModalSubmitInteraction
} from 'discord.js';

import { pool } from '../database/pool';

function suggestionButtons(id: string, up: number, down: number) {
  const votes = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hollow:suggestions:vote:up:${id}`)
      .setLabel(`For (${up})`)
      .setEmoji('✅')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`hollow:suggestions:vote:down:${id}`)
      .setLabel(`Against (${down})`)
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  const newSuggestion = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('hollow:suggestions:new')
      .setLabel('New Suggestion')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Danger)
  );

  return [votes, newSuggestion];
}

function createSuggestionEmbed(
  username: string,
  avatar: string,
  category: string,
  content: string
) {
  return new EmbedBuilder()
    .setColor(0x310B12)
    .setAuthor({
      name: `${username} | Suggestion`,
      iconURL: avatar
    })
    .addFields(
      {
        name: '📌 Category',
        value: category.slice(0, 100)
      },
      {
        name: '✏️ Suggestion',
        value: content.slice(0, 1000)
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Hollow Studios • Suggestions' });
}

export async function handleSuggestionInteraction(
  interaction: ButtonInteraction | ModalSubmitInteraction
): Promise<void> {
  if (interaction.isButton()) {
    if (interaction.customId === 'hollow:suggestions:new') {
      const modal = new ModalBuilder()
        .setCustomId('hollow:suggestions:submit')
        .setTitle('New Suggestion');

      const category = new StringSelectMenuBuilder()
        .setCustomId('category')
        .setPlaceholder('Select a category')
        .addOptions(
          { label: 'Roblox', value: 'Roblox' },
          { label: 'Discord', value: 'Discord' },
          { label: 'General', value: 'General' }
        );

      const content = new TextInputBuilder()
        .setCustomId('content')
        .setPlaceholder('e.g. Add weekly community events every Friday...')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true);

      modal.addLabelComponents(
        new LabelBuilder()
          .setLabel('Category')
          .setStringSelectMenuComponent(category),
        new LabelBuilder()
          .setLabel('Suggestion')
          .setTextInputComponent(content)
      );

      await interaction.showModal(modal);
      return;
    }

    if (!interaction.customId.startsWith('hollow:suggestions:vote:')) {
      return;
    }

    const parts = interaction.customId.split(':');
    const vote = parts[3];
    const suggestionId = parts[4];

    if (!suggestionId || !['up', 'down'].includes(vote)) {
      await interaction.reply({
        content: 'Invalid suggestion vote.',
        ephemeral: true
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.reply({
        content: 'This action can only be used inside a server.',
        ephemeral: true
      });
      return;
    }

    const connection = await pool.connect();

    try {
      await connection.query('BEGIN');

      const suggestion = await connection.query(
        `SELECT id FROM suggestions
         WHERE id = $1 AND guild_id = $2`,
        [suggestionId, interaction.guild.id]
      );

      if (suggestion.rowCount === 0) {
        await connection.query('ROLLBACK');
        await interaction.reply({
          content: 'This suggestion no longer exists.',
          ephemeral: true
        });
        return;
      }

      await connection.query(
        `INSERT INTO suggestion_votes
          (suggestion_id, user_id, vote)
         VALUES ($1, $2, $3)
         ON CONFLICT (suggestion_id, user_id)
         DO UPDATE SET vote = EXCLUDED.vote, updated_at = NOW()`,
        [suggestionId, interaction.user.id, vote]
      );

      const counts = await connection.query(
        `SELECT
          COUNT(*) FILTER (WHERE vote = 'up')::int AS up,
          COUNT(*) FILTER (WHERE vote = 'down')::int AS down
         FROM suggestion_votes
         WHERE suggestion_id = $1`,
        [suggestionId]
      );

      await connection.query('COMMIT');

      const up = counts.rows[0].up ?? 0;
      const down = counts.rows[0].down ?? 0;

      await interaction.update({
        components: suggestionButtons(suggestionId, up, down)
      });
    } catch (error) {
      await connection.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      connection.release();
    }

    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId !== 'hollow:suggestions:submit') return;

    if (!interaction.guild) {
      await interaction.reply({
        content: 'This action can only be used inside a server.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const category = interaction.fields.getStringSelectValues('category')[0];
    const content = interaction.fields.getTextInputValue('content').trim();

    if (!category || !content) {
      await interaction.editReply('Please complete both fields.');
      return;
    }

    if (!interaction.channelId) {
      await interaction.editReply('Could not determine the submission channel.');
      return;
    }

    const channel = await interaction.guild.channels.fetch(
      interaction.channelId
    );

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply(
        'Suggestions can only be submitted in a text channel.'
      );
      return;
    }

    const result = await pool.query(
      `INSERT INTO suggestions
        (guild_id, channel_id, user_id, category, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        interaction.guild.id,
        channel.id,
        interaction.user.id,
        category,
        content
      ]
    );

    const id = String(result.rows[0].id);

    try {
      const message = await channel.send({
        embeds: [
          createSuggestionEmbed(
            interaction.user.username,
            interaction.user.displayAvatarURL(),
            category,
            content
          )
        ],
        components: suggestionButtons(id, 0, 0)
      });

      await pool.query(
        'UPDATE suggestions SET message_id = $1 WHERE id = $2',
        [message.id, id]
      );

      await interaction.editReply(
        'Your suggestion has been submitted successfully!'
      );
    } catch (error) {
      await pool.query('DELETE FROM suggestions WHERE id = $1', [id]);
      throw error;
    }
  }
}
