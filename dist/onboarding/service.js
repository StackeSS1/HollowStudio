"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingRoleGroups = void 0;
exports.ensureOnboardingRoles = ensureOnboardingRoles;
exports.buildOnboardingPanel = buildOnboardingPanel;
const discord_js_1 = require("discord.js");
exports.onboardingRoleGroups = {
    interests: [
        { name: '🎮 Gaming' },
        { name: '💻 Development' },
        { name: '🎨 Design' },
        { name: '🎥 Content Creator' },
        { name: '🛠️ Other' }
    ],
    notifications: [
        { name: '📢 Announcements' },
        { name: '🎮 Game Updates' },
        { name: '🎁 Giveaways' },
        { name: '📊 Polls & Surveys' },
        { name: '📅 Events' }
    ]
};
async function ensureOnboardingRoles(guild) {
    await guild.roles.fetch();
    for (const group of Object.values(exports.onboardingRoleGroups)) {
        for (const entry of group) {
            const existing = guild.roles.cache.find(role => role.name === entry.name);
            if (!existing) {
                await guild.roles.create({
                    name: entry.name,
                    color: 0x747F8D,
                    hoist: false,
                    mentionable: false,
                    permissions: [],
                    reason: 'Hollow Studio onboarding roles'
                });
            }
        }
    }
}
async function buildOnboardingPanel(guild, member) {
    await ensureOnboardingRoles(guild);
    const makeMenu = (groupName, entries, placeholder) => {
        const options = entries.map(entry => {
            const role = guild.roles.cache.find(item => item.name === entry.name);
            if (!role) {
                throw new Error(`Onboarding role missing: ${entry.name}`);
            }
            return new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel(entry.name)
                .setValue(role.id)
                .setDefault(member.roles.cache.has(role.id));
        });
        return new discord_js_1.StringSelectMenuBuilder()
            .setCustomId(`hollow:onboarding:${groupName}`)
            .setPlaceholder(placeholder)
            .setMinValues(0)
            .setMaxValues(options.length)
            .addOptions(options);
    };
    const interestsMenu = makeMenu('interests', exports.onboardingRoleGroups.interests, 'Step 1 — Choose your interests');
    const notificationsMenu = makeMenu('notifications', exports.onboardingRoleGroups.notifications, 'Step 2 — Choose your notifications');
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0x747F8D)
        .setTitle("Let's customize your experience!")
        .setDescription([
        'Welcome to **Hollow Studios**!',
        '',
        '**Step 1 — Your interests**',
        'Choose the topics you are interested in.',
        '',
        '**Step 2 — Notifications**',
        'Choose which updates you want to be notified about.',
        '',
        'You can select multiple options or leave a section empty.',
        'You can change your choices at any time.'
    ].join('\n'))
        .setFooter({ text: 'Hollow Studios • Personalize your experience' });
    return {
        content: `Welcome ${member}!`,
        embeds: [embed],
        components: [
            new discord_js_1.ActionRowBuilder()
                .addComponents(interestsMenu),
            new discord_js_1.ActionRowBuilder()
                .addComponents(notificationsMenu)
        ]
    };
}
