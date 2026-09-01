import { ChannelType } from 'discord.js';

import { logger } from '../utils/logger.js';

import {
    buildLogDescription,
    buildStandardLogEmbed,
    fieldsToLines,
    splitComparisonFields,
    appendContentSection,
} from '../utils/logging/logEmbeds.js';

import {
    LOG_CHANNELS,
    LOG_COLORS,
} from '../config/logChannels.js';


export const EVENT_TYPES = {

    MODERATION_BAN: 'moderation.ban',
    MODERATION_KICK: 'moderation.kick',
    MODERATION_MUTE: 'moderation.mute',
    MODERATION_WARN: 'moderation.warn',
    MODERATION_PURGE: 'moderation.purge',
    MODERATION_TIMEOUT: 'moderation.timeout',
    MODERATION_UNTIMEOUT: 'moderation.untimeout',
    MODERATION_UNBAN: 'moderation.unban',
    MODERATION_LOCK: 'moderation.lock',
    MODERATION_UNLOCK: 'moderation.unlock',
    MODERATION_DM: 'moderation.dm',
    MODERATION_CONFIG: 'moderation.config',

    MESSAGE_DELETE: 'message.delete',
    MESSAGE_EDIT: 'message.edit',
    MESSAGE_BULK_DELETE: 'message.bulkdelete',

    ROLE_CREATE: 'role.create',
    ROLE_DELETE: 'role.delete',
    ROLE_UPDATE: 'role.update',

    CHANNEL_CREATE: 'channel.create',
    CHANNEL_DELETE: 'channel.delete',
    CHANNEL_UPDATE: 'channel.update',

    MEMBER_JOIN: 'member.join',
    MEMBER_LEAVE: 'member.leave',
    MEMBER_NAME_CHANGE: 'member.namechange',

    BOT_ADD: 'bot.add',
    BOT_REMOVE: 'bot.remove',

    WEBHOOK_CREATE: 'webhook.create',
    WEBHOOK_UPDATE: 'webhook.update',
    WEBHOOK_DELETE: 'webhook.delete',

    INTEGRATION_CREATE: 'integration.create',
    INTEGRATION_UPDATE: 'integration.update',
    INTEGRATION_DELETE: 'integration.delete',

    REACTION_ROLE_ADD: 'reactionrole.add',
    REACTION_ROLE_REMOVE: 'reactionrole.remove',
    REACTION_ROLE_CREATE: 'reactionrole.create',
    REACTION_ROLE_DELETE: 'reactionrole.delete',
    REACTION_ROLE_UPDATE: 'reactionrole.update',

    GIVEAWAY_CREATE: 'giveaway.create',
    GIVEAWAY_WINNER: 'giveaway.winner',
    GIVEAWAY_REROLL: 'giveaway.reroll',
    GIVEAWAY_DELETE: 'giveaway.delete',

    COUNTER_UPDATE: 'counter.update',
    COUNTER_CONFIG: 'counter.config',

    APPLICATION_SUBMIT: 'application.submit',
    APPLICATION_REVIEW: 'application.review',

    REPORT_FILE: 'report.file',
};


export const EVENT_COLORS = {

    'moderation.ban': LOG_COLORS.deleted,
    'moderation.kick': LOG_COLORS.deleted,
    'moderation.mute': LOG_COLORS.warning,
    'moderation.warn': LOG_COLORS.warning,
    'moderation.purge': LOG_COLORS.deleted,
    'moderation.timeout': LOG_COLORS.warning,
    'moderation.untimeout': LOG_COLORS.created,
    'moderation.unban': LOG_COLORS.created,
    'moderation.lock': LOG_COLORS.deleted,
    'moderation.unlock': LOG_COLORS.created,
    'moderation.dm': LOG_COLORS.info,
    'moderation.config': LOG_COLORS.info,

    'message.delete': LOG_COLORS.deleted,
    'message.edit': LOG_COLORS.edited,
    'message.bulkdelete': LOG_COLORS.deleted,

    'role.create': LOG_COLORS.created,
    'role.delete': LOG_COLORS.deleted,
    'role.update': LOG_COLORS.edited,

    'channel.create': LOG_COLORS.created,
    'channel.delete': LOG_COLORS.deleted,
    'channel.update': LOG_COLORS.edited,

    'member.join': LOG_COLORS.created,
    'member.leave': LOG_COLORS.deleted,
    'member.namechange': LOG_COLORS.edited,

    'bot.add': LOG_COLORS.created,
    'bot.remove': LOG_COLORS.deleted,

    'webhook.create': LOG_COLORS.created,
    'webhook.update': LOG_COLORS.edited,
    'webhook.delete': LOG_COLORS.deleted,

    'integration.create': LOG_COLORS.created,
    'integration.update': LOG_COLORS.edited,
    'integration.delete': LOG_COLORS.deleted,

    'reactionrole.add': LOG_COLORS.created,
    'reactionrole.remove': LOG_COLORS.deleted,
    'reactionrole.create': LOG_COLORS.created,
    'reactionrole.delete': LOG_COLORS.deleted,
    'reactionrole.update': LOG_COLORS.edited,

    'giveaway.create': LOG_COLORS.created,
    'giveaway.winner': LOG_COLORS.created,
    'giveaway.reroll': LOG_COLORS.edited,
    'giveaway.delete': LOG_COLORS.deleted,

    'counter.update': LOG_COLORS.info,
    'counter.config': LOG_COLORS.edited,

    'application.submit': LOG_COLORS.info,
    'application.review': LOG_COLORS.created,

    'report.file': LOG_COLORS.warning,
};


export const EVENT_ICONS = {

    'moderation.ban': '🔨',
    'moderation.kick': '👢',
    'moderation.mute': '🔇',
    'moderation.warn': '⚠️',
    'moderation.purge': '🗑️',
    'moderation.timeout': '⏱️',
    'moderation.untimeout': '🟢',
    'moderation.unban': '🔓',
    'moderation.lock': '🔒',
    'moderation.unlock': '🔓',
    'moderation.dm': '✉️',
    'moderation.config': '⚙️',

    'message.delete': '🗑️',
    'message.edit': '✏️',
    'message.bulkdelete': '🗑️',

    'role.create': '🎭',
    'role.delete': '🎭',
    'role.update': '🎭',

    'channel.create': '📁',
    'channel.delete': '📁',
    'channel.update': '📁',

    'member.join': '👋',
    'member.leave': '👋',
    'member.namechange': '🏷️',

    'bot.add': '🤖',
    'bot.remove': '🤖',

    'webhook.create': '🔗',
    'webhook.update': '🔗',
    'webhook.delete': '🔗',

    'integration.create': '🔌',
    'integration.update': '🔌',
    'integration.delete': '🔌',

    'reactionrole.add': '✅',
    'reactionrole.remove': '❌',
    'reactionrole.create': '🎭',
    'reactionrole.delete': '🗑️',
    'reactionrole.update': '🔄',

    'giveaway.create': '🎁',
    'giveaway.winner': '🎉',
    'giveaway.reroll': '🔄',
    'giveaway.delete': '🗑️',

    'counter.update': '📊',
    'counter.config': '⚙️',

    'application.submit': '📝',
    'application.review': '📋',

    'report.file': '🚨',
};


function getChannelId(eventType) {

    if (
        eventType.startsWith('moderation.') ||
        eventType.startsWith('report.')
    ) {
        return LOG_CHANNELS.moderation;
    }

    if (
        eventType.startsWith('message.')
    ) {
        return LOG_CHANNELS.messages;
    }

    if (
        eventType.startsWith('role.') ||
        eventType.startsWith('channel.')
    ) {
        return LOG_CHANNELS.roleChannel;
    }

    if (
        eventType.startsWith('member.')
    ) {
        return LOG_CHANNELS.members;
    }

    if (
        eventType.startsWith('bot.') ||
        eventType.startsWith('webhook.') ||
        eventType.startsWith('integration.')
    ) {
        return LOG_CHANNELS.botIntegration;
    }

    return LOG_CHANNELS.botIntegration;
}


export async function logEvent({
    client,
    guildId,
    eventType,
    data = {},
    attachments = [],
    content = null,
    channelId = null,
}) {

    try {

        const guild =
            client.guilds.cache.get(guildId) ||
            await client.guilds
                .fetch(guildId)
                .catch(() => null);

        if (!guild) {
            logger.warn(
                `Logging: guild ${guildId} not found`
            );
            return null;
        }


        /*
         * Explicit channel override.
         * Otherwise use the fixed channel
         * for this event type.
         */

        const targetChannelId =
            channelId ||
            getChannelId(eventType);


        if (!targetChannelId) {
            return null;
        }


        const channel =
            guild.channels.cache.get(
                targetChannelId
            ) ||
            await guild.channels
                .fetch(targetChannelId)
                .catch(() => null);


        if (
            !channel ||
            !channel.isTextBased()
        ) {

            logger.warn(
                `Logging: channel ${targetChannelId} is unavailable`
            );

            return null;
        }


        const me =
            guild.members.me ||
            await guild.members
                .fetch(client.user.id)
                .catch(() => null);


        const permissions =
            me
                ? channel.permissionsFor(me)
                : null;


        if (
            permissions &&
            !permissions.has([
                'ViewChannel',
                'SendMessages',
                'EmbedLinks',
            ])
        ) {

            logger.warn(
                `Logging: missing permissions in ${targetChannelId}`
            );

            return null;
        }


        const embed =
            createLogEmbed(
                guild,
                eventType,
                data
            );


        const messageOptions = {
            embeds: [embed],
        };


        if (content) {
            messageOptions.content =
                content;
        }


        if (
            attachments?.length
        ) {
            messageOptions.files =
                attachments;
        }


        const sent =
            await channel.send(
                messageOptions
            );


        return sent;

    } catch (error) {

        logger.error(
            `Logging error for ${eventType}:`,
            error
        );

        return null;
    }
}


function createLogEmbed(
    guild,
    eventType,
    data
) {

    const color =
        data.color ??
        EVENT_COLORS[eventType] ??
        LOG_COLORS.info;


    const icon =
        EVENT_ICONS[eventType] ||
        '📌';


    const title =
        data.title ||
        `${icon} ${formatEventType(eventType)}`;


    const inlineFields = [];


    let description =
        data.description || '';


    if (data.lines?.length) {

        description =
            buildLogDescription({

                headline:
                    data.headline ||
                    description ||
                    undefined,

                lines:
                    data.lines,

                quoted:
                    data.quoted !== false,

                meta:
                    data.meta,
            });


        if (data.fields?.length) {

            const {
                before,
                after,
            } =
                splitComparisonFields(
                    data.fields
                );


            if (before !== null) {

                inlineFields.push({

                    name:
                        'Before',

                    value:
                        before,

                    inline:
                        true,
                });
            }


            if (after !== null) {

                inlineFields.push({

                    name:
                        'After',

                    value:
                        after,

                    inline:
                        true,
                });
            }
        }

    } else if (data.fields?.length) {

        const {
            before,
            after,
            rest,
        } =
            splitComparisonFields(
                data.fields
            );


        if (
            before !== null ||
            after !== null
        ) {

            description =
                buildLogDescription({

                    headline:
                        description ||
                        undefined,

                    lines:
                        fieldsToLines(rest),

                    quoted:
                        true,
                });


            if (before !== null) {

                inlineFields.push({

                    name:
                        'Before',

                    value:
                        before,

                    inline:
                        true,
                });
            }


            if (after !== null) {

                inlineFields.push({

                    name:
                        'After',

                    value:
                        after,

                    inline:
                        true,
                });
            }

        } else {

            description =
                buildLogDescription({

                    headline:
                        description ||
                        undefined,

                    lines:
                        fieldsToLines(
                            data.fields
                        ),

                    quoted:
                        data.quoted ??
                        !description,
                });
        }

    } else if (data.meta?.length) {

        description =
            buildLogDescription({

                headline:
                    description ||
                    undefined,

                meta:
                    data.meta,
            });
    }


    if (data.section?.body) {

        description =
            appendContentSection(
                description,
                data.section.title ||
                    'Message',
                data.section.body
            );
    }


    if (data.inlineFields?.length) {

        inlineFields.push(
            ...data.inlineFields
        );
    }


    return buildStandardLogEmbed({

        color,

        title,

        description:
            description ||
            undefined,

        thumbnail:
            data.thumbnail ||
            undefined,

        inlineFields,

        fields:
            data.blockFields ||
            [],

        author:
            data.author ||
            null,

        timestamp:
            true,

        footer:
            data.footer || {

                text:
                    guild.name,

                iconURL:
                    guild.iconURL({
                        dynamic: true,
                    }) ||
                    undefined,
            },
    });
}


function formatEventType(
    eventType
) {

    return eventType
        .split('.')
        .map(
            part =>
                part.charAt(0).toUpperCase() +
                part.slice(1)
        )
        .join(' ');
}


/*
 * Compatibility exports.
 *
 * These don't control logging anymore.
 * They are kept so another existing part
 * of the bot won't crash if it imports them.
 */

export function resolveLogChannel(
    config,
    destination
) {

    if (
        destination === 'audit'
    ) {
        return LOG_CHANNELS.moderation;
    }

    if (
        destination === 'applications'
    ) {
        return LOG_CHANNELS.moderation;
    }

    if (
        destination === 'reports'
    ) {
        return LOG_CHANNELS.moderation;
    }

    return LOG_CHANNELS.moderation;
}


export function getIgnoreList() {

    return {
        users: [],
        channels: [],
    };
}


export function isEventEnabled() {

    return true;
}


export async function getLoggingStatus() {

    return {

        enabled:
            true,

        channels:
            LOG_CHANNELS,

        ignore: {

            users: [],

            channels: [],
        },

        enabledEvents: {},

        allEventTypes:
            EVENT_TYPES,
    };
}


export async function toggleEventLogging() {

    return true;
}


export async function setLogChannel() {

    return true;
}


export async function setLoggingChannel() {

    return true;
}


export async function setLoggingEnabled() {

    return true;
}


export async function updateIgnoreList() {

    return true;
}


export function resolveApplicationLogChannel() {

    return LOG_CHANNELS.moderation;
}


export const LOG_DESTINATIONS = [
    'audit',
    'applications',
    'reports',
];
