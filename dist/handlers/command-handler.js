"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCommands = loadCommands;
const discord_js_1 = require("discord.js");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const interactions_1 = require("../roblox/interactions");
const interactions_2 = require("../tickets/interactions");
const interactions_3 = require("../suggestions/interactions");
async function loadCommands(client) {
    const commands = new discord_js_1.Collection();
    const root = node_path_1.default.resolve(__dirname, '../commands');
    const extension = node_path_1.default.extname(__filename) === '.js' ? '.js' : '.ts';
    async function scan(directory) {
        const entries = await (0, promises_1.readdir)(directory, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(directory, entry.name);
            if (entry.isDirectory()) {
                await scan(fullPath);
                continue;
            }
            if (!entry.name.endsWith(extension))
                continue;
            const imported = await Promise.resolve(`${fullPath}`).then(s => __importStar(require(s)));
            const command = imported.default;
            if (!command?.data || !command?.execute) {
                console.warn(`[COMMAND] Invalid command: ${entry.name}`);
                continue;
            }
            commands.set(command.data.name, command);
            console.log(`[COMMAND] Loaded /${command.data.name}`);
        }
    }
    await scan(root);
    client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
        try {
            if (interaction.isButton() || interaction.isModalSubmit()) {
                if (interaction.customId.startsWith('hollow:ticket:')) {
                    await (0, interactions_2.handleTicketInteraction)(interaction);
                }
                else if (interaction.customId.startsWith('hollow:suggestions:')) {
                    await (0, interactions_3.handleSuggestionInteraction)(interaction);
                }
                else if (interaction.customId.startsWith('hollow:')) {
                    await (0, interactions_1.handleRobloxInteraction)(interaction);
                }
                return;
            }
            if (!interaction.isChatInputCommand())
                return;
            const command = commands.get(interaction.commandName);
            if (!command)
                return;
            await command.execute(interaction);
        }
        catch (error) {
            console.error('[INTERACTION ERROR]', error);
            const response = {
                content: 'An unexpected error occurred.',
                flags: discord_js_1.MessageFlags.Ephemeral
            };
            if (interaction.isRepliable()) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(response).catch(console.error);
                }
                else {
                    await interaction.reply(response).catch(console.error);
                }
            }
        }
    });
    console.log(`[HOLLOW] Loaded ${commands.size} commands.`);
    return commands;
}
