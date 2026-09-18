import {
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js';

import { config } from '../../config/config.js';
import { sendLog } from '../../services/logger.js';

function getMember(guild, input) {
    if (!input) return null;

    const id = input.replace(/[<@!>]/g, '');

    return guild.members.cache.get(id)
        || guild.members.fetch(id).catch(() => null);
}

function getRole(guild, input) {
    if (!input) return null;

    const roleId = input.replace(/[<@&>]/g, '');

    return guild.roles.cache.find(
        role => role.id === roleId || role.name.toLowerCase() === input.toLowerCase()
    );
}

function formatUser(user) {
    return `${user} (\`${user.id}\`)`;
}

async function moderationLog(client, title, moderator, target, action, reason) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0xED4245)
        .addFields(
            {
                name: 'User',
                value: formatUser(target),
                inline: false,
            },
            {
                name: 'Moderator',
                value: formatUser(moderator),
                inline: false,
            },
            {
                name: 'Action',
                value: action,
                inline: true,
            },
            {
                name: 'Reason',
                value: reason || 'No reason provided',
                inline: true,
            }
        )
        .setTimestamp();

    await sendLog(client, 'moderation', embed);
}

function hasPermission(message, permission) {
    return message.member.permissions.has(permission);
}

function botCanModerate(message, member) {
    if (!member) return false;

    return member.id !== message.guild.ownerId
        && member.roles.highest.position < message.guild.members.me.roles.highest.position;
}

function parseDuration(input) {
    if (!input) return null;

    const match = input.match(/^(\d+)(s|m|h|d)$/i);

    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };

    const duration = amount * multipliers[unit];

    if (duration < 1000 || duration > 28 * 24 * 60 * 60 * 1000) {
        return null;
    }

    return duration;
}

async function reply(message, content) {
    return message.reply({
        content,
    });
}

export default {
    name: 'moderation',

    async execute(message, args, client) {
        if (!message.guild || message.author.bot) return;

        const command = args.shift()?.toLowerCase();

        if (!command) return;

        // =========================
        // BAN
        // =========================

        if (command === 'ban') {
            if (!hasPermission(message, PermissionFlagsBits.BanMembers)) {
                return reply(message, '❌ You need **Ban Members** permission.');
            }

            const targetInput = args.shift();

            if (!targetInput) {
                return reply(message, 'Usage: `,ban @user [reason]`');
            }

            const target = await getMember(message.guild, targetInput);

            if (!target) {
                return reply(message, '❌ I could not find that member.');
            }

            if (!botCanModerate(message, target)) {
                return reply(message, '❌ I cannot moderate that member because of role hierarchy.');
            }

            const reason = args.join(' ') || 'No reason provided';

            await target.ban({ reason }).catch(error => {
                console.error(error);
                return reply(message, '❌ I could not ban that member.');
            });

            await moderationLog(
                client,
                '🔨 Member Banned',
                message.author,
                target.user,
                'Ban',
                reason
            );

            return reply(message, `✅ Banned **${target.user.tag}**.`);
        }

        // =========================
        // UNBAN
        // =========================

        if (command === 'unban') {
            if (!hasPermission(message, PermissionFlagsBits.BanMembers)) {
                return reply(message, '❌ You need **Ban Members** permission.');
            }

            const userId = args.shift()?.replace(/[<@!>]/g, '');

            if (!userId) {
                return reply(message, 'Usage: `,unban USER_ID`');
            }

            const banned = await message.guild.bans.fetch(userId).catch(() => null);

            if (!banned) {
                return reply(message, '❌ That user is not banned or the ID is invalid.');
            }

            await message.guild.members.unban(userId).catch(error => {
                console.error(error);
                return reply(message, '❌ I could not unban that user.');
            });

            const embed = new EmbedBuilder()
                .setTitle('🔓 Member Unbanned')
                .setColor(0x57F287)
                .addFields(
                    {
                        name: 'User',
                        value: `${banned.user} (\`${banned.user.id}\`)`,
                    },
                    {
                        name: 'Moderator',
                        value: formatUser(message.author),
                    }
                )
                .setTimestamp();

            await sendLog(client, 'moderation', embed);

            return reply(message, `✅ Unbanned **${banned.user.tag}**.`);
        }

        // =========================
        // KICK
        // =========================

        if (command === 'kick') {
            if (!hasPermission(message, PermissionFlagsBits.KickMembers)) {
                return reply(message, '❌ You need **Kick Members** permission.');
            }

            const targetInput = args.shift();

            if (!targetInput) {
                return reply(message, 'Usage: `,kick @user [reason]`');
            }

            const target = await getMember(message.guild, targetInput);

            if (!target) {
                return reply(message, '❌ I could not find that member.');
            }

            if (!botCanModerate(message, target)) {
                return reply(message, '❌ I cannot moderate that member because of role hierarchy.');
            }

            const reason = args.join(' ') || 'No reason provided';

            await target.kick(reason).catch(error => {
                console.error(error);
                return reply(message, '❌ I could not kick that member.');
            });

            await moderationLog(
                client,
                '👢 Member Kicked',
                message.author,
                target.user,
                'Kick',
                reason
            );

            return reply(message, `✅ Kicked **${target.user.tag}**.`);
        }

        // =========================
        // TIMEOUT
        // =========================

        if (command === 'timeout') {
            if (!hasPermission(message, PermissionFlagsBits.ModerateMembers)) {
                return reply(message, '❌ You need **Moderate Members** permission.');
            }

            const targetInput = args.shift();
            const durationInput = args.shift();

            if (!targetInput || !durationInput) {
                return reply(message, 'Usage: `,timeout @user 10m [reason]`');
            }

            const duration = parseDuration(durationInput);

            if (!duration) {
                return reply(
                    message,
                    '❌ Invalid duration. Use formats such as `30s`, `10m`, `2h`, or `7d`.'
                );
            }

            const target = await getMember(message.guild, targetInput);

            if (!target) {
                return reply(message, '❌ I could not find that member.');
            }

            if (!botCanModerate(message, target)) {
                return reply(message, '❌ I cannot moderate that member because of role hierarchy.');
            }

            const reason = args.join(' ') || 'No reason provided';

            await target.timeout(duration, reason).catch(error => {
                console.error(error);
                return reply(message, '❌ I could not timeout that member.');
            });

            await moderationLog(
                client,
                '⏱️ Member Timed Out',
                message.author,
                target.user,
                `Timeout (${durationInput})`,
                reason
            );

            return reply(message, `✅ Timed out **${target.user.tag}** for **${durationInput}**.`);
        }

        // =========================
        // UNTIMEOUT
        // =========================

        if (command === 'untimeout') {
            if (!hasPermission(message, PermissionFlagsBits.ModerateMembers)) {
                return reply(message, '❌ You need **Moderate Members** permission.');
            }

            const targetInput = args.shift();

            if (!targetInput) {
                return reply(message, 'Usage: `,untimeout @user`');
            }

            const target = await getMember(message.guild, targetInput);

            if (!target) {
                return reply(message, '❌ I could not find that member.');
            }

            await target.timeout(null, 'Timeout removed').catch(error => {
                console.error(error);
                return reply(message, '❌ I could not remove the timeout.');
            });

            await moderationLog(
                client,
                '🔓 Timeout Removed',
                message.author,
                target.user,
                'Untimeout',
                'Timeout removed'
            );

            return reply(message, `✅ Removed timeout from **${target.user.tag}**.`);
        }

        // =========================
        // PURGE
        // =========================

        if (command === 'purge') {
            if (!hasPermission(message, PermissionFlagsBits.ManageMessages)) {
                return reply(message, '❌ You need **Manage Messages** permission.');
            }

            const amount = Number(args.shift());

            if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
                return reply(message, 'Usage: `,purge 1-100`');
            }

            const deleted = await message.channel.bulkDelete(amount, true).catch(error => {
                console.error(error);
                return null;
            });

            if (!deleted) {
                return reply(message, '❌ I could not purge those messages.');
            }

            const embed = new EmbedBuilder()
                .setTitle('🧹 Messages Purged')
                .setColor(0xED4245)
                .addFields(
                    {
                        name: 'Channel',
                        value: `${message.channel}`,
                        inline: true,
                    },
                    {
                        name: 'Amount',
                        value: `${deleted.size}`,
                        inline: true,
                    },
                    {
                        name: 'Moderator',
                        value: formatUser(message.author),
                    }
                )
                .setTimestamp();

            await sendLog(client, 'moderation', embed);

            return message.channel.send(`🧹 Deleted **${deleted.size}** messages.`);
        }

        // =========================
        // GIVE ROLE
        // =========================

        if (command === 'give') {
            if (!hasPermission(message, PermissionFlagsBits.ManageRoles)) {
                return reply(message, '❌ You need **Manage Roles** permission.');
            }

            if (args.shift()?.toLowerCase() !== 'role') {
                return reply(message, 'Usage: `,give role <role name> @user`');
            }

            const targetInput = args.pop();
            const roleName = args.join(' ');

            if (!targetInput || !roleName) {
                return reply(message, 'Usage: `,give role <role name> @user`');
            }

            const target = await getMember(message.guild, targetInput);
            const role = getRole(message.guild, roleName);

            if (!target) {
                return reply(message, '❌ I could not find that member.');
            }

            if (!role) {
                return reply(message, '❌ I could not find that role.');
            }

            if (role.position >= message.guild.members.me.roles.highest.position) {
                return reply(message, '❌ I cannot manage that role because it is above my highest role.');
            }

            await target.roles.add(role).catch(error => {
                console.error(error);
                return reply(message, '❌ I could not give that role.');
            });

            const embed = new EmbedBuilder()
                .setTitle('➕ Role Added')
                .setColor(0x57F287)
                .addFields(
                    {
                        name: 'User',
                        value: formatUser(target.user),
                    },
                    {
                        name: 'Role',
                        value: `${role} (\`${role.id}\`)`,
                    },
                    {
                        name: 'Moderator',
                        value: formatUser(message.author),
                    }
                )
                .setTimestamp();

            await sendLog(client, 'moderation', embed);

            return reply(message, `✅ Added **${role.name}** to **${target.user.tag}**.`);
        }

        // =========================
        // REMOVE ROLE
        // =========================

        if (command === 'remove') {
            if (!hasPermission(message, PermissionFlagsBits.ManageRoles)) {
                return reply(message, '❌ You need **Manage Roles** permission.');
            }

            if (args.shift()?.toLowerCase() !== 'role') {
                return reply(message, 'Usage: `,remove role <role name> @user`');
            }

            const targetInput = args.pop();
            const roleName = args.join(' ');

            if (!targetInput || !roleName) {
                return reply(message, 'Usage: `,remove role <role name> @user`');
            }

            const target = await getMember(message.guild, targetInput);
            const role = getRole(message.guild, roleName);

            if (!target) {
                return reply(message, '❌ I could not find that member.');
            }

            if (!role) {
                return reply(message, '❌ I could not find that role.');
            }

            if (role.position >= message.guild.members.me.roles.highest.position) {
                return reply(message, '❌ I cannot manage that role because it is above my highest role.');
            }

            await target.roles.remove(role).catch(error => {
                console.error(error);
                return reply(message, '❌ I could not remove that role.');
            });

            const embed = new EmbedBuilder()
                .setTitle('➖ Role Removed')
                .setColor(0xED4245)
                .addFields(
                    {
                        name: 'User',
                        value: formatUser(target.user),
                    },
                    {
                        name: 'Role',
                        value: `${role} (\`${role.id}\`)`,
                    },
                    {
                        name: 'Moderator',
                        value: formatUser(message.author),
                    }
                )
                .setTimestamp();

            await sendLog(client, 'moderation', embed);

            return reply(message, `✅ Removed **${role.name}** from **${target.user.tag}**.`);
        }
    },
};
