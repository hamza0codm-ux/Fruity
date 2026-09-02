import {
    PermissionFlagsBits,
    AuditLogEvent,
} from 'discord.js';

import {
    securityConfig,
    isWhitelisted,
} from './securityConfig.js';

import {
    securityLog,
} from './securityLogger.js';

const messageHistory = new Map();
const duplicateHistory = new Map();
const joinHistory = new Map();
const nukeHistory = new Map();

const DISCORD_INVITE_REGEX =
    /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite|discord\.me|discord\.io)\/[A-Za-z0-9-]+/gi;

const URL_REGEX =
    /https?:\/\/[^\s<]+/gi;

const SUSPICIOUS_LINK_PATTERNS = [
    /free[-_ ]?(nitro|gift)/i,
    /discord[-_ ]?nitro[-_ ]?free/i,
    /claim[-_ ]?(your|a)[-_ ]?(gift|nitro)/i,
    /steam[-_ ]?community.*gift/i,
    /steamcommunity.*\/gift/i,
    /giveaway.*claim/i,
    /verify[-_ ]?(your|account)/i,
    /discord.*verify.*login/i,
    /nitro.*generator/i,
    /free.*robux/i,
    /free.*vbucks/i,
];

function getMessageBucket(
    guildId,
    userId
) {
    const key =
        `${guildId}:${userId}`;

    if (!messageHistory.has(key)) {
        messageHistory.set(
            key,
            []
        );
    }

    return messageHistory.get(key);
}

function getDuplicateBucket(
    guildId,
    userId
) {
    const key =
        `${guildId}:${userId}`;

    if (!duplicateHistory.has(key)) {
        duplicateHistory.set(
            key,
            []
        );
    }

    return duplicateHistory.get(key);
}

function getJoinBucket(
    guildId
) {
    if (!joinHistory.has(guildId)) {
        joinHistory.set(
            guildId,
            []
        );
    }

    return joinHistory.get(guildId);
}

function getNukeBucket(
    guildId,
    userId
) {
    const key =
        `${guildId}:${userId}`;

    if (!nukeHistory.has(key)) {
        nukeHistory.set(
            key,
            []
        );
    }

    return nukeHistory.get(key);
}

export function detectSecurityViolation(
    content
) {
    if (!content) {
        return null;
    }

    if (
        securityConfig.phishing.enabled &&
        securityConfig.phishing.blockDiscordInvites &&
        DISCORD_INVITE_REGEX.test(content)
    ) {
        DISCORD_INVITE_REGEX.lastIndex = 0;

        return {
            type:
                'discord-invite',

            reason:
                'Discord invite links are not allowed in this server.',
        };
    }

    DISCORD_INVITE_REGEX.lastIndex = 0;

    if (
        securityConfig.phishing.enabled &&
        securityConfig.phishing.blockSuspiciousLinks
    ) {
        const urls =
            content.match(URL_REGEX) || [];

        for (const url of urls) {
            for (
                const pattern of
                SUSPICIOUS_LINK_PATTERNS
            ) {
                if (
                    pattern.test(url) ||
                    pattern.test(content)
                ) {
                    return {
                        type:
                            'phishing',

                        reason:
                            'Suspicious/phishing link detected.',

                        url,
                    };
                }
            }
        }
    }

    return null;
}

/*
|--------------------------------------------------------------------------
| MESSAGE SECURITY
|--------------------------------------------------------------------------
*/

export async function processMessageSecurity(
    message
) {
    if (
        !message.guild ||
        message.author.bot
    ) {
        return false;
    }

    if (!securityConfig.enabled) {
        return false;
    }

    if (
        await isWhitelisted(
            message.author.id,
            message.guild,
            message.client
        )
    ) {
        return false;
    }

    /*
     * PHISHING / DISCORD INVITES
     */

    const violation =
        detectSecurityViolation(
            message.content
        );

    if (violation) {
        await message
            .delete()
            .catch(() => {});

        await punishForSecurityViolation(
            message.member,
            violation.type ===
                'discord-invite'
                ? 'Posting Discord invite link'
                : 'Posting suspicious/phishing link'
        );

        await securityLog(
            message.client,
            {
                title:
                    violation.type ===
                    'discord-invite'
                        ? '🔗 Discord Invite Blocked'
                        : '⚠️ Phishing Link Blocked',

                description:
                    `${message.author} attempted to send prohibited content.`,

                color:
                    0xED4245,

                fields: [
                    {
                        name:
                            'User',

                        value:
                            `${message.author.tag}\n\`${message.author.id}\``,

                        inline:
                            true,
                    },

                    {
                        name:
                            'Channel',

                        value:
                            `${message.channel}\n\`${message.channel.id}\``,

                        inline:
                            true,
                    },

                    {
                        name:
                            'Reason',

                        value:
                            violation.reason,
                    },
                ],

                actionPanel: {
                    targetId:
                        message.author.id,

                    targetName:
                        message.author.tag,
                },
            }
        );

        return true;
    }

    /*
     * SPAM
     */

    if (
        securityConfig.spam.enabled
    ) {
        const now =
            Date.now();

        const bucket =
            getMessageBucket(
                message.guild.id,
                message.author.id
            );

        bucket.push(now);

        const validMessages =
            bucket.filter(
                timestamp =>
                    now - timestamp <=
                    securityConfig.spam.messageWindow
            );

        messageHistory.set(
            `${message.guild.id}:${message.author.id}`,
            validMessages
        );

        if (
            validMessages.length >=
            securityConfig.spam.messageLimit
        ) {
            await message
                .delete()
                .catch(() => {});

            await punishForSecurityViolation(
                message.member,
                'Message spam'
            );

            await securityLog(
                message.client,
                {
                    title:
                        '💬 Spam Detected',

                    description:
                        `${message.author} exceeded the spam threshold.`,

                    color:
                        0xFEE75C,

                    fields: [
                        {
                            name:
                                'Messages',

                            value:
                                `${validMessages.length}`,

                            inline:
                                true,
                        },

                        {
                            name:
                                'Window',

                            value:
                                `${securityConfig.spam.messageWindow}ms`,

                            inline:
                                true,
                        },

                        {
                            name:
                                'User',

                            value:
                                `${message.author.tag}\n\`${message.author.id}\``,
                        },
                    ],

                    actionPanel: {
                        targetId:
                            message.author.id,

                        targetName:
                            message.author.tag,
                    },
                }
            );

            return true;
        }

        /*
         * DUPLICATE MESSAGE SPAM
         */

        if (
            message.content.trim().length >
            3
        ) {
            const duplicates =
                getDuplicateBucket(
                    message.guild.id,
                    message.author.id
                );

            duplicates.push({
                content:
                    message.content
                        .trim()
                        .toLowerCase(),

                timestamp:
                    now,
            });

            const recent =
                duplicates.filter(
                    item =>
                        now - item.timestamp <=
                        securityConfig.spam.duplicateWindow
                );

            duplicateHistory.set(
                `${message.guild.id}:${message.author.id}`,
                recent
            );

            const duplicateCount =
                recent.filter(
                    item =>
                        item.content ===
                        message.content
                            .trim()
                            .toLowerCase()
                ).length;

            if (
                duplicateCount >=
                securityConfig.spam.duplicateLimit
            ) {
                await message
                    .delete()
                    .catch(() => {});

                await punishForSecurityViolation(
                    message.member,
                    'Repeated duplicate messages'
                );

                await securityLog(
                    message.client,
                    {
                        title:
                            '🔁 Duplicate Spam Detected',

                        description:
                            `${message.author} repeatedly sent the same message.`,

                        color:
                            0xFEE75C,

                        fields: [
                            {
                                name:
                                    'User',

                                value:
                                    `${message.author.tag}\n\`${message.author.id}\``,
                            },

                            {
                                name:
                                    'Duplicate Count',

                                value:
                                    `${duplicateCount}`,
                            },
                        ],

                        actionPanel: {
                            targetId:
                                message.author.id,

                            targetName:
                                message.author.tag,
                        },
                    }
                );

                return true;
            }
        }
    }

    /*
     * MENTION SPAM
     */

    const mentionCount =
        message.mentions.users.size +
        message.mentions.roles.size;

    if (
        mentionCount >=
        securityConfig.spam.mentionLimit
    ) {
        await message
            .delete()
            .catch(() => {});

        await punishForSecurityViolation(
            message.member,
            'Mention spam'
        );

        await securityLog(
            message.client,
            {
                title:
                    '📢 Mention Spam Detected',

                description:
                    `${message.author} sent excessive mentions.`,

                color:
                    0xFEE75C,

                fields: [
                    {
                        name:
                            'Mentions',

                        value:
                            `${mentionCount}`,
                    },

                    {
                        name:
                            'User',

                        value:
                            `${message.author.tag}\n\`${message.author.id}\``,
                    },
                ],

                actionPanel: {
                    targetId:
                        message.author.id,

                    targetName:
                        message.author.tag,
                },
            }
        );

        return true;
    }

    return false;
}

/*
|--------------------------------------------------------------------------
| AUTOMATIC MINOR PUNISHMENT
|--------------------------------------------------------------------------
*/

async function punishForSecurityViolation(
    member,
    reason
) {
    if (!member) {
        return;
    }

    try {
        if (
            member.moderatable &&
            member.permissions.has(
                PermissionFlagsBits.Administrator
            ) === false
        ) {
            await member.timeout(
                5 * 60 * 1000,
                reason
            );
        }
    } catch {
        // Ignore punishment failures.
    }
}

/*
|--------------------------------------------------------------------------
| RAID / ALT DETECTION
|--------------------------------------------------------------------------
*/

export async function processRaidJoin(
    member
) {
    if (
        !member.guild ||
        member.user.bot
    ) {
        return;
    }

    if (
        !securityConfig.enabled ||
        !securityConfig.antiRaid.enabled ||
        await isWhitelisted(
            member.id,
            member.guild,
            member.client
        )
    ) {
        return;
    }

    const now =
        Date.now();

    const joins =
        getJoinBucket(
            member.guild.id
        );

    joins.push({
        userId:
            member.id,

        timestamp:
            now,
    });

    const recent =
        joins.filter(
            join =>
                now - join.timestamp <=
                securityConfig.antiRaid.joinWindow
        );

    joinHistory.set(
        member.guild.id,
        recent
    );

    /*
     * POSSIBLE ALT ACCOUNT
     *
     * Account age alone does NOT prove someone
     * is an alt, so this remains a minor alert.
     */

    const accountAge =
        Date.now() -
        member.user.createdTimestamp;

    const accountAgeDays =
        accountAge /
        (1000 * 60 * 60 * 24);

    if (
        accountAgeDays <
        securityConfig.antiRaid.accountAgeDays
    ) {
        let severity =
            'Possible alt account';

        if (
            accountAgeDays < 3
        ) {
            severity =
                'Very new account — possible alt';
        }

        await securityLog(
            member.client,
            {
                title:
                    '⚠️ Possible Alt Account',

                description:
                    `${member.user} joined with an unusually new Discord account.`,

                color:
                    0xFEE75C,

                fields: [
                    {
                        name:
                            'User',

                        value:
                            `${member.user.tag}\n\`${member.id}\``,

                        inline:
                            true,
                    },

                    {
                        name:
                            'Account Age',

                        value:
                            `${accountAgeDays.toFixed(2)} days`,

                        inline:
                            true,
                    },

                    {
                        name:
                            'Detection',

                        value:
                            severity,
                    },

                    {
                        name:
                            'Reason',

                        value:
                            'The account is younger than the configured security threshold. This is not proof that the account is an alt.',
                    },
                ],

                actionPanel: {
                    targetId:
                        member.id,

                    targetName:
                        member.user.tag,
                },
            }
        );
    }

    /*
     * RAID DETECTION
     *
     * This stays automatic.
     */

    if (
        recent.length >=
        securityConfig.antiRaid.joinLimit
    ) {
        securityConfig.raidMode.add(
            member.guild.id
        );

        for (
            const join of recent
        ) {
            const joinedMember =
                member.guild.members.cache.get(
                    join.userId
                );

            if (
                joinedMember &&
                joinedMember.moderatable
            ) {
                await joinedMember
                    .timeout(
                        securityConfig
                            .antiRaid
                            .timeoutMinutes *
                            60 *
                            1000,

                        'Anti-raid protection'
                    )
                    .catch(() => {});
            }
        }

        await securityLog(
            member.client,
            {
                title:
                    '🚨 RAID DETECTED',

                description:
                    'A possible join raid has been detected. New members have been temporarily restricted.',

                color:
                    0xED4245,

                fields: [
                    {
                        name:
                            'Joins',

                        value:
                            `${recent.length}`,

                        inline:
                            true,
                    },

                    {
                        name:
                            'Window',

                        value:
                            `${securityConfig.antiRaid.joinWindow / 1000}s`,

                        inline:
                            true,
                    },

                    {
                        name:
                            'Mode',

                        value:
                            'RAID MODE ACTIVE',

                        inline:
                            true,
                    },
                ],
            }
        );
    }
}

/*
|--------------------------------------------------------------------------
| ANTI-NUKE
|--------------------------------------------------------------------------
*/

export async function processAuditAction({
    client,
    guild,
    executor,
    action,
    target,
}) {
    if (
        !guild ||
        !executor
    ) {
        return;
    }

    if (
        !securityConfig.enabled ||
        !securityConfig.antiNuke.enabled ||
        executor.bot ||
        await isWhitelisted(
            executor.id,
            guild,
            client
        )
    ) {
        return;
    }

    const destructiveActions =
        new Set([
            AuditLogEvent.ChannelDelete,
            AuditLogEvent.RoleDelete,
            AuditLogEvent.MemberBanAdd,
            AuditLogEvent.MemberKick,
            AuditLogEvent.WebhookDelete,
            AuditLogEvent.WebhookCreate,
            AuditLogEvent.ChannelCreate,
            AuditLogEvent.RoleCreate,
            AuditLogEvent.MemberUpdate,
            AuditLogEvent.GuildUpdate,
            AuditLogEvent.BotAdd,
        ]);

    if (
        !destructiveActions.has(
            action
        )
    ) {
        return;
    }

    const now =
        Date.now();

    const bucket =
        getNukeBucket(
            guild.id,
            executor.id
        );

    bucket.push({
        action,
        timestamp:
            now,

        targetId:
            target?.id ||
            null,
    });

    const recent =
        bucket.filter(
            item =>
                now - item.timestamp <=
                securityConfig.antiNuke.actionWindow
        );

    nukeHistory.set(
        `${guild.id}:${executor.id}`,
        recent
    );

    await securityLog(
        client,
        {
            title:
                '⚠️ Dangerous Server Action',

            description:
                `${executor} performed a potentially dangerous server action.`,

            color:
                0xFEE75C,

            fields: [
                {
                    name:
                        'Executor',

                    value:
                        `${executor.tag}\n\`${executor.id}\``,
                },

                {
                    name:
                        'Action',

                    value:
                        `${action}`,

                    inline:
                        true,
                },

                {
                    name:
                        'Actions Recently',

                    value:
                        `${recent.length}`,

                    inline:
                        true,
                },

                {
                    name:
                        'Target',

                    value:
                        target?.name ||
                        target?.tag ||
                        target?.id ||
                        'Unknown',
                },
            ],
        }
    );

    /*
     * Major incident.
     * Automatic protection remains enabled.
     */
    if (
        recent.length >=
        securityConfig.antiNuke.actionLimit
    ) {
        await neutralizeNuker(
            client,
            guild,
            executor,
            recent
        );

        nukeHistory.delete(
            `${guild.id}:${executor.id}`
        );
    }
}

async function neutralizeNuker(
    client,
    guild,
    executor,
    actions
) {
    const member =
        guild.members.cache.get(
            executor.id
        ) ||
        await guild.members
            .fetch(executor.id)
            .catch(() => null);

    if (!member) {
        return;
    }

    await securityLog(
        client,
        {
            title:
                '☢️ ANTI-NUKE ACTIVATED',

            description:
                `${executor} triggered the anti-nuke threshold.`,

            color:
                0xED4245,

            fields: [
                {
                    name:
                        'Actions Detected',

                    value:
                        `${actions.length}`,

                    inline:
                        true,
                },

                {
                    name:
                        'Window',

                    value:
                        `${securityConfig.antiNuke.actionWindow / 1000}s`,

                    inline:
                        true,
                },
            ],
        }
    );

    /*
     * Remove dangerous roles.
     */

    if (
        securityConfig
            .antiNuke
            .removeDangerousRoles
    ) {
        const dangerousRoles =
            member.roles.cache.filter(
                role =>
                    role.id !==
                        guild.id &&
                    !role.managed &&
                    role.editable &&
                    role.permissions.any([
                        PermissionFlagsBits.Administrator,
                        PermissionFlagsBits.ManageGuild,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.ManageRoles,
                        PermissionFlagsBits.ManageWebhooks,
                        PermissionFlagsBits.BanMembers,
                        PermissionFlagsBits.KickMembers,
                    ])
            );

        for (
            const role of
            dangerousRoles.values()
        ) {
            await member.roles
                .remove(
                    role,
                    'Anti-nuke protection'
                )
                .catch(() => {});
        }
    }

    /*
     * Automatic timeout.
     */

    if (
        member.moderatable
    ) {
        await member
            .timeout(
                60 * 60 * 1000,
                'Anti-nuke protection'
            )
            .catch(() => {});
    }

    /*
     * Automatic ban.
     */

    if (
        securityConfig
            .antiNuke
            .banExecutor &&
        member.bannable
    ) {
        await guild.members
            .ban(
                executor.id,
                {
                    reason:
                        'Anti-nuke protection triggered',

                    deleteMessageSeconds:
                        0,
                }
            )
            .catch(() => {});
    }
}

/*
|--------------------------------------------------------------------------
| LOCKDOWN
|--------------------------------------------------------------------------
*/

export async function enableLockdown(
    guild
) {
    if (
        securityConfig.lockdown.enabled
    ) {
        return false;
    }

    securityConfig.lockdown.enabled =
        true;

    const saved =
        new Map();

    for (
        const channel of
        guild.channels.cache.values()
    ) {
        if (
            !channel.isTextBased?.()
        ) {
            continue;
        }

        if (
            !channel.permissionOverwrites
        ) {
            continue;
        }

        const overwrite =
            channel.permissionOverwrites.cache.get(
                guild.roles.everyone.id
            );

        saved.set(
            channel.id,
            overwrite?.deny?.bitfield?.toString() ||
                '0'
        );

        await channel.permissionOverwrites
            .edit(
                guild.roles.everyone,
                {
                    SendMessages:
                        false,
                },
                {
                    reason:
                        'Security lockdown',
                }
            )
            .catch(() => {});
    }

    securityConfig
        .lockdownChannels
        .set(
            guild.id,
            saved
        );

    return true;
}

export async function disableLockdown(
    guild
) {
    if (
        !securityConfig.lockdown.enabled
    ) {
        return false;
    }

    const saved =
        securityConfig
            .lockdownChannels
            .get(guild.id);

    if (saved) {
        for (
            const [
                channelId,
                previousDeny,
            ] of saved
        ) {
            const channel =
                guild.channels.cache.get(
                    channelId
                );

            if (
                !channel?.permissionOverwrites
            ) {
                continue;
            }

            const numericDeny =
                BigInt(
                    previousDeny ||
                        '0'
                );

            const currentlyDenied =
                (
                    numericDeny &
                    BigInt(
                        PermissionFlagsBits.SendMessages
                    )
                ) !==
                0n;

            await channel.permissionOverwrites
                .edit(
                    guild.roles.everyone,
                    {
                        SendMessages:
                            currentlyDenied
                                ? false
                                : null,
                    },
                    {
                        reason:
                            'Security lockdown ended',
                    }
                )
                .catch(() => {});
        }
    }

    securityConfig
        .lockdownChannels
        .delete(
            guild.id
        );

    securityConfig.lockdown.enabled =
        false;

    return true;
}

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

export function getSecurityStatus(
    guildId
) {
    const whitelistCount =
        [...securityConfig.whitelistedUsers]
            .filter(key =>
                key.startsWith(
                    `${guildId}:`
                )
            ).length;

    return {
        enabled:
            securityConfig.enabled,

        phishing:
            securityConfig.phishing.enabled,

        discordInvitesBlocked:
            securityConfig.phishing
                .blockDiscordInvites,

        spam:
            securityConfig.spam.enabled,

        antiRaid:
            securityConfig.antiRaid.enabled,

        antiNuke:
            securityConfig.antiNuke.enabled,

        raidMode:
            securityConfig.raidMode.has(
                guildId
            ),

        lockdown:
            securityConfig.lockdown.enabled,

        whitelistedUsers:
            whitelistCount,
    };
}

/*
|--------------------------------------------------------------------------
| SECURITY SCAN
|--------------------------------------------------------------------------
*/

export function scanGuild(
    guild
) {
    const problems = [];
    const warnings = [];
    const good = [];

    const everyone =
        guild.roles.everyone;

    if (
        everyone.permissions.has(
            PermissionFlagsBits.Administrator
        )
    ) {
        problems.push(
            '@everyone has Administrator permission.'
        );
    } else {
        good.push(
            '@everyone does not have Administrator.'
        );
    }

    const adminRoles =
        guild.roles.cache.filter(
            role =>
                !role.managed &&
                role.permissions.has(
                    PermissionFlagsBits.Administrator
                )
        );

    if (
        adminRoles.size > 3
    ) {
        warnings.push(
            `${adminRoles.size} roles have Administrator permission.`
        );
    } else {
        good.push(
            `${adminRoles.size} Administrator role(s) found.`
        );
    }

    const dangerousRoles =
        guild.roles.cache.filter(
            role =>
                !role.managed &&
                role.permissions.any([
                    PermissionFlagsBits.Administrator,
                    PermissionFlagsBits.ManageGuild,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageRoles,
                    PermissionFlagsBits.ManageWebhooks,
                    PermissionFlagsBits.BanMembers,
                    PermissionFlagsBits.KickMembers,
                ])
        );

    if (
        dangerousRoles.size > 10
    ) {
        warnings.push(
            `${dangerousRoles.size} roles have high-risk permissions.`
        );
    }

    const adminBots =
        guild.members.cache.filter(
            member =>
                member.user.bot &&
                member.permissions.has(
                    PermissionFlagsBits.Administrator
                )
        );

    if (
        adminBots.size > 2
    ) {
        warnings.push(
            `${adminBots.size} bots have Administrator permission.`
        );
    } else {
        good.push(
            `${adminBots.size} bot(s) have Administrator permission.`
        );
    }

    const publicDangerousChannels =
        guild.channels.cache.filter(
            channel => {
                if (
                    !channel.permissionOverwrites
                ) {
                    return false;
                }

                const overwrite =
                    channel.permissionOverwrites.cache.get(
                        guild.roles.everyone.id
                    );

                return overwrite?.allow?.has(
                    PermissionFlagsBits.MentionEveryone
                );
            }
        );

    if (
        publicDangerousChannels.size >
        0
    ) {
        warnings.push(
            `${publicDangerousChannels.size} channel(s) allow @everyone to mention everyone.`
        );
    }

    if (
        securityConfig.phishing
            .blockDiscordInvites
    ) {
        good.push(
            'Discord invite links are blocked.'
        );
    }

    if (
        securityConfig.antiNuke.enabled
    ) {
        good.push(
            'Anti-nuke protection is enabled.'
        );
    }

    if (
        securityConfig.antiRaid.enabled
    ) {
        good.push(
            'Anti-raid protection is enabled.'
        );
    }

    return {
        problems,
        warnings,
        good,

        score:
            Math.max(
                0,
                Math.min(
                    100,

                    100 -
                        problems.length *
                            20 -
                        warnings.length *
                            5
                )
            ),
    };
}
