"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOnboardingInteraction = handleOnboardingInteraction;
const discord_js_1 = require("discord.js");
const service_1 = require("./service");
async function handleOnboardingInteraction(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
        await interaction.reply({
            content: 'This menu can only be used inside a server.',
            flags: discord_js_1.MessageFlags.Ephemeral
        });
        return;
    }
    const groupName = interaction.customId.endsWith(':interests')
        ? 'interests'
        : 'notifications';
    const entries = service_1.onboardingRoleGroups[groupName];
    await (0, service_1.ensureOnboardingRoles)(interaction.guild);
    const allowedRoles = entries.map(entry => {
        const role = interaction.guild.roles.cache.find(item => item.name === entry.name);
        if (!role) {
            throw new Error(`Onboarding role missing: ${entry.name}`);
        }
        return role.id;
    });
    if (interaction.values.some(value => !allowedRoles.includes(value))) {
        await interaction.reply({
            content: 'Invalid role selection.',
            flags: discord_js_1.MessageFlags.Ephemeral
        });
        return;
    }
    let member = await interaction.guild.members.fetch(interaction.user.id);
    const selected = interaction.values;
    const toAdd = selected.filter(id => !member.roles.cache.has(id));
    const toRemove = allowedRoles.filter(id => !selected.includes(id) && member.roles.cache.has(id));
    if (toAdd.length > 0) {
        member = await member.roles.add(toAdd, 'Onboarding role selection');
    }
    if (toRemove.length > 0) {
        member = await member.roles.remove(toRemove, 'Onboarding role selection');
    }
    const panel = await (0, service_1.buildOnboardingPanel)(interaction.guild, member);
    const { flags: _flags, ...updateOptions } = panel;
    await interaction.update(updateOptions);
}
