import {
  Client,
  Collection,
  Events,
  MessageFlags
} from 'discord.js';

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { HollowCommand } from '../types/command';
import { handleRobloxInteraction } from '../roblox/interactions';
import { handleTicketInteraction } from '../tickets/interactions';
import { handleSuggestionInteraction } from '../suggestions/interactions';

export async function loadCommands(client: Client) {
  const commands = new Collection<string, HollowCommand>();
  const root = path.join(process.cwd(), 'src/commands');

  async function scan(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
        continue;
      }

      if (!entry.name.endsWith('.ts')) continue;

      const imported = await import(pathToFileURL(fullPath).href);
      const command = imported.default as HollowCommand;

      if (!command?.data || !command?.execute) {
        console.warn(`[COMMAND] Invalid command: ${entry.name}`);
        continue;
      }

      commands.set(command.data.name, command);
      console.log(`[COMMAND] Loaded /${command.data.name}`);
    }
  }

  await scan(root);

  client.on(Events.InteractionCreate, async interaction => {
    try {
      if (interaction.isButton() || interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('hollow:ticket:')) {
          await handleTicketInteraction(interaction);
        } else if (interaction.customId.startsWith('hollow:suggestions:')) {
          await handleSuggestionInteraction(interaction);
        } else if (interaction.customId.startsWith('hollow:')) {
          await handleRobloxInteraction(interaction);
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      const command = commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction);
    } catch (error) {
      console.error('[INTERACTION ERROR]', error);

      const response = {
        content: 'An unexpected error occurred.',
        flags: MessageFlags.Ephemeral as const
      };

      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response).catch(console.error);
        } else {
          await interaction.reply(response).catch(console.error);
        }
      }
    }
  });

  console.log(`[HOLLOW] Loaded ${commands.size} commands.`);
  return commands;
}
