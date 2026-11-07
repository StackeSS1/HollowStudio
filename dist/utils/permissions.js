"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = hasPermission;
exports.isAdministrator = isAdministrator;
exports.hasAnyPermission = hasAnyPermission;
const discord_js_1 = require("discord.js");
function hasPermission(member, permission) {
    return member.permissions.has(permission);
}
function isAdministrator(member) {
    return member.permissions.has(discord_js_1.PermissionsBitField.Flags.Administrator);
}
function hasAnyPermission(member, permissions) {
    return permissions.some(permission => member.permissions.has(permission));
}
