import {
  GuildMember,
  PermissionResolvable,
  PermissionsBitField
} from 'discord.js';

export function hasPermission(
  member: GuildMember,
  permission: PermissionResolvable
): boolean {
  return member.permissions.has(permission);
}

export function isAdministrator(member: GuildMember): boolean {
  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

export function hasAnyPermission(
  member: GuildMember,
  permissions: PermissionResolvable[]
): boolean {
  return permissions.some(permission =>
    member.permissions.has(permission)
  );
}
