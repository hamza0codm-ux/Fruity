import {
    PermissionFlagsBits,
} from 'discord.js';

import {
    SECURITY_LOG_CHANNEL_ID,
} from '../../../security/securityConfig.js';

import {
    ModerationService,
} from '../../../services/moderation/moderationService.js';

import {
    securityLog,
} from '../../../security/securityLogger.js';

const ACTIONS = {
    timeout: {
        label: 'Timeout',
        permission:
            PermissionFlagsBits.ModerateMembers,
    },

    kick: {
        label: 'Kick',
        permission:
            PermissionFlagsBits.KickMembers,
    },

    ban: {
        label: 'Ban',
        permission:
            PermissionFlagsBits.BanMembers,
    },

    remove_roles: {
        label: 'Remove Roles',
        permission:
            PermissionFlagsBits.ManageRoles,
    },
};

const TIMEOUT_DURATION =
    10 * 60 * 1000;

function getMember(
    guild,
    userId
) {
    return (
        guild.members.cache.get(userId) ||
        null
    );
}

function getBotMember(
    guild
) {
    return (
        guild.members.me ||
        guild.members.cache.get(
            guild.client.user.id
        )
    );
}

function hasPermission(
    interaction,
    permission
) {
    return Boolean(
        interaction.memberPermissions?.has(
            permission
        )
    );
}

function canBotPerform(
    guild,
    permission
) {
    const botMember =
        getBotMember(guild);

    if (!botMember) {
        return false;
    }

    return botMember.permissions.has(
        permission
    );
}

async function removeRoles(
    guild,
    member
) {
    const botMember =
        getBotMember(guild);

    if (!botMember) {
        return {
            success: false,
            removed: 0,
            reason:
                'I could not resolve my own member.',
        };
    }

    const removableRoles =
        member.roles.cache.filter(
            role =>
                role.id !== guild.id &&
                !role.managed &&
                role.editable &&
                role.position <
                    botMember.roles.highest.position
        );

    if (!removableRoles.size) {
        return {
            success: false,
            removed: 0,
            reason:
                'I cannot remove any of this user\'s roles because of role hierarchy.',
        };
    }

    let removed = 0;

    for (const role of removableRoles.values()) {
        try {
            await member.roles.remove(
                role,
                'Security action: Remove Roles'
            );

            removed++;
        } catch {
            // Continue with the remaining roles.
        }
    }

    return {
        success: removed > 0,
        removed,
        reason:
            removed > 0
                ? null
                : 'I could not remove the roles.',
    };
}

export default {
    name: 'security_action',

    async execute(
        interaction,
        client,
        args
    ) {
        /*
         * Expected:
         *
         * security_action
         * :action
         * :targetId
         * :expiresAt
         */
        const action =
            args?.[0];

        const targetId =
            args?.[1];

        const expiresAt =
            Number(args?.[2]);

        if (
            !action ||
            !targetId ||
            !Number.isFinite(expiresAt)
        ) {
            return interaction.reply({
                content:
                    '❌ This security action is invalid.',
                ephemeral: true,
            });
        }

        /*
         * Check expiration first.
         */
        if (
            Date.now() >=
            expiresAt
        ) {
            return interaction.reply({
                content:
                    '⏱️ This security action has expired.',
                ephemeral: true,
            });
        }

        const actionInfo =
            ACTIONS[action];

        if (!actionInfo) {
            return interaction.reply({
                content:
                    '❌ Unknown security action.',
                ephemeral: true,
            });
        }

        /*
         * Must be used inside a server.
         */
        if (!interaction.guild) {
            return interaction.reply({
                content:
                    '❌ This can only be used inside a server.',
                ephemeral: true,
            });
        }

        /*
         * Buttons can ONLY be used from
         * the security log channel.
         */
        if (
            interaction.channelId !==
            SECURITY_LOG_CHANNEL_ID
        ) {
            return interaction.reply({
                content:
                    '❌ Security actions can only be used from the security log channel.',
                ephemeral: true,
            });
        }

        /*
         * User must be able to view the security
         * log channel.
         */
        if (
            !interaction.channel
                ?.permissionsFor(
                    interaction.user.id
                )
                ?.has(
                    PermissionFlagsBits.ViewChannel
                )
        ) {
            return interaction.reply({
                content:
                    '❌ You do not have access to the security log channel.',
                ephemeral: true,
            });
        }

        /*
         * Check the normal Discord permission.
         */
        if (
            !hasPermission(
                interaction,
                actionInfo.permission
            )
        ) {
            return interaction.reply({
                content:
                    `❌ You need **${actionInfo.label === 'Timeout'
                        ? 'Moderate Members'
                        : actionInfo.label === 'Kick'
                            ? 'Kick Members'
                            : actionInfo.label === 'Ban'
                                ? 'Ban Members'
                                : 'Manage Roles'}** to use this action.`,
                ephemeral: true,
            });
        }

        /*
         * Check bot permission.
         */
        if (
            !canBotPerform(
                interaction.guild,
                actionInfo.permission
            )
        ) {
            return interaction.reply({
                content:
                    `❌ I do not have the required **${actionInfo.label}** permission.`,
                ephemeral: true,
            });
        }

        /*
         * Fetch target.
         */
        const target =
            getMember(
                interaction.guild,
                targetId
            );

        /*
         * For actions other than ban, the target
         * must still be inside the server.
         */
        if (
            !target &&
            action !== 'ban'
        ) {
            return interaction.reply({
                content:
                    '❌ That user is no longer in the server.',
                ephemeral: true,
            });
        }

        /*
         * Never moderate the server owner.
         */
        if (
            target &&
            target.id ===
                interaction.guild.ownerId
        ) {
            return interaction.reply({
                content:
                    '❌ The server owner cannot be moderated by this system.',
                ephemeral: true,
            });
        }

        /*
         * Never allow a moderator to moderate
         * themselves through the security buttons.
         */
        if (
            targetId ===
            interaction.user.id
        ) {
            return interaction.reply({
                content:
                    '❌ You cannot use a security action on yourself.',
                ephemeral: true,
            });
        }

        /*
         * BOT hierarchy check.
         */
        const botMember =
            getBotMember(
                interaction.guild
            );

        if (
            target &&
            botMember &&
            target.roles.highest.position >=
                botMember.roles.highest.position
        ) {
            return interaction.reply({
                content:
                    '❌ I cannot moderate this user because their highest role is equal to or higher than mine.',
                ephemeral: true,
            });
        }

        /*
         * MODERATOR hierarchy check.
         *
         * This uses the same moderation service
         * used by normal moderation commands.
         */
        try {
            if (action === 'timeout') {
                await ModerationService.timeoutUser({
                    guild: interaction.guild,
                    member: target,
                    moderator: interaction.member,
                    durationMs:
                        TIMEOUT_DURATION,
                    reason:
                        'Security alert action',
                });
            }

            if (action === 'kick') {
                await ModerationService.kickUser({
                    guild: interaction.guild,
                    member: target,
                    moderator: interaction.member,
                    reason:
                        'Security alert action',
                });
            }

            if (action === 'ban') {
                await ModerationService.banUser({
                    guild: interaction.guild,
                    user: targetId,
                    moderator: interaction.member,
                    reason:
                        'Security alert action',
                    deleteDays: 0,
                });
            }

            if (action === 'remove_roles') {
                const result =
                    await removeRoles(
                        interaction.guild,
                        target
                    );

                if (!result.success) {
                    return interaction.reply({
                        content:
                            `❌ ${result.reason}`,
                        ephemeral: true,
                    });
                }

                await interaction.reply({
                    content:
                        `🎭 Removed **${result.removed}** role(s) from <@${targetId}>.`,
                    ephemeral: true,
                });

                await securityLog(
                    client,
                    {
                        title:
                            '🎭 Security Action — Roles Removed',

                        description:
                            `${interaction.user} removed roles from <@${targetId}> using a security alert.`,

                        color:
                            0xFEE75C,

                        fields: [
                            {
                                name:
                                    'Moderator',
                                value:
                                    `${interaction.user.tag}\n\`${interaction.user.id}\``,
                            },
                            {
                                name:
                                    'Target',
                                value:
                                    `<@${targetId}>\n\`${targetId}\``,
                            },
                            {
                                name:
                                    'Roles Removed',
                                value:
                                    `${result.removed}`,
                            },
                        ],
                    }
                );

                return;
            }

            await interaction.reply({
                content:
                    `✅ **${actionInfo.label}** action applied to <@${targetId}>.`,
                ephemeral: true,
            });

            /*
             * Security audit entry.
             *
             * The buttons intentionally remain usable so staff
             * can perform another action if required.
             */
            await securityLog(
                client,
                {
                    title:
                        `🛡️ Security Action — ${actionInfo.label}`,

                    description:
                        `${interaction.user} used a security alert action on <@${targetId}>.`,

                    color:
                        action === 'ban'
                            ? 0xED4245
                            : 0xFEE75C,

                    fields: [
                        {
                            name:
                                'Moderator',
                            value:
                                `${interaction.user.tag}\n\`${interaction.user.id}\``,
                        },
                        {
                            name:
                                'Target',
                            value:
                                `<@${targetId}>\n\`${targetId}\``,
                        },
                        {
                            name:
                                'Action',
                            value:
                                actionInfo.label,
                        },
                    ],
                }
            );
        } catch (error) {
            console.error(
                '[Security] Security button action failed:',
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                return interaction.reply({
                    content:
                        `❌ I could not apply **${actionInfo.label}**. ${error?.message || 'Check permissions and role hierarchy.'}`,
                    ephemeral: true,
                });
            }

            return interaction.followUp({
                content:
                    `❌ I could not apply **${actionInfo.label}**. ${error?.message || 'Check permissions and role hierarchy.'}`,
                ephemeral: true,
            });
        }
    },
};
