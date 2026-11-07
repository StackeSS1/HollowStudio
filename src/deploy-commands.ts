import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HollowCommand } from './types/command';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    throw new Error('DISCORD_TOKEN, CLIENT_ID and GUILD_ID must be configured in .env');
  }

  const commands: object[] = [];
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
        console.warn(`[DEPLOY] Skipped invalid command: ${entry.name}`);
        continue;
      }

      commands.push(command.data.toJSON());
      console.log(`[DEPLOY] Found /${command.data.name}`);
    }
  }

  await scan(root);

  if (commands.length === 0) {
    throw new Error('No valid slash commands found.');
  }

  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );

  console.log(`[DEPLOY] Successfully registered ${commands.length} commands.`);
}

main().catch(error => {
  console.error('[DEPLOY ERROR]', error);
  process.exitCode = 1;
});
