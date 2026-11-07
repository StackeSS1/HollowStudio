import { ChatInputCommandInteraction } from 'discord.js';

export interface HollowCommand {
  data: {
    name: string;
    toJSON(): any;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
