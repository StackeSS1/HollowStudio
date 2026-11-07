import { Client, GuildMember } from 'discord.js';
import { pool } from '../database/pool';

export interface RobloxConfig {
  groupId: string;
  roleId: string;
}

export async function getRobloxConfig(guildId: string): Promise<RobloxConfig | null> {
  const result = await pool.query(
    `SELECT settings->'roblox' AS roblox
     FROM guild_settings WHERE guild_id = $1`,
    [guildId]
  );

  const config = result.rows[0]?.roblox;
  if (!config?.groupId || !config?.roleId) return null;
  return config as RobloxConfig;
}

export async function getRobloxUser(username: string) {
  const response = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true
    })
  });

  if (!response.ok) throw new Error(`Roblox API error: ${response.status}`);

  const data = await response.json() as {
    data?: Array<{ id: number; name: string; displayName: string }>;
  };

  return data.data?.[0] ?? null;
}

export async function isRobloxGroupMember(userId: number, groupId: string) {
  const response = await fetch(
    `https://groups.roblox.com/v2/users/${userId}/groups/roles`
  );

  if (!response.ok) throw new Error(`Roblox groups API error: ${response.status}`);

  const data = await response.json() as {
    data?: Array<{ group: { id: number } }>;
  };

  return (data.data ?? []).some(item => String(item.group.id) === groupId);
}

export async function getRobloxDescription(userId: number) {
  const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);

  if (!response.ok) throw new Error(`Roblox profile API error: ${response.status}`);

  const data = await response.json() as { description?: string };
  return data.description ?? '';
}

export async function giveHollowRole(member: GuildMember, roleId: string) {
  const role = await member.guild.roles.fetch(roleId);
  if (!role) throw new Error('Hollow Guy role does not exist.');

  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(role, 'Hollow Studio Roblox verification');
  }
}

export async function syncRobloxMembers(client: Client) {
  const result = await pool.query(`
    SELECT a.discord_id, a.roblox_id, a.roblox_username,
           a.guild_id, a.group_id,
           gs.settings->'roblox' AS config
    FROM roblox_accounts a
    JOIN guild_settings gs ON gs.guild_id = a.guild_id
    WHERE a.guild_id IS NOT NULL
  `);

  for (const account of result.rows) {
    try {
      const config = account.config as RobloxConfig | null;
      if (!config?.groupId || !config?.roleId) continue;

      const guild = await client.guilds.fetch(account.guild_id).catch(() => null);
      if (!guild) continue;

      const member = await guild.members.fetch(account.discord_id).catch(() => null);
      if (!member) continue;

      const belongs = await isRobloxGroupMember(Number(account.roblox_id), config.groupId);

      if (belongs) {
        await giveHollowRole(member, config.roleId);
      } else if (member.roles.cache.has(config.roleId)) {
        await member.roles.remove(config.roleId, 'Roblox group membership ended');

        await pool.query(
          `INSERT INTO audit_logs
            (guild_id, actor_id, action, target_id, metadata)
           VALUES ($1, NULL, 'roblox_role_removed', $2, $3::jsonb)`,
          [
            account.guild_id,
            account.discord_id,
            JSON.stringify({
              robloxId: account.roblox_id,
              robloxUsername: account.roblox_username,
              groupId: config.groupId,
              roleId: config.roleId,
              reason: 'Roblox group membership ended'
            })
          ]
        ).catch(error => console.error('[ROBLOX AUDIT]', error));
      }
    } catch (error) {
      console.error('[ROBLOX SYNC]', error);
    }
  }
}
