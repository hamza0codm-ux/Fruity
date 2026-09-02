import {
    Events,
} from 'discord.js';

import {
    logEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    formatLogLine,
} from '../utils/logging/logEmbeds.js';

import {
    logger,
} from '../utils/logger.js';


function permissionOverwritesChanged(
    oldChannel,
    newChannel
) {
    const oldCache =
        oldChannel.permissionOverwrites?.cache;

    const newCache =
        newChannel.permissionOverwrites?.cache;

    if (!oldCache || !newCache) {
        return false;
    }

    if (oldCache.size !== newCache.size) {
        return true;
    }

    for (const [id, oldOverwrite] of oldCache) {
        const newOverwrite =
            newCache.get(id);

        if (!newOverwrite) {
            return true;
        }

        if (
            oldOverwrite.allow.bitfield !==
                newOverwrite.allow.bitfield ||
            oldOverwrite.deny.bitfield !==
                newOverwrite.deny.bitfield
        ) {
            return true;
        }
    }

    return false;
}


export default {
    name: Events.ChannelUpdate,
    once: false,

    async execute(
        oldChannel,
        newChannel
    ) {
        try {
            if (!newChannel.guild) {
                return;
            }

            const changes = [];


            // NAME
            if (
                oldChannel.name !==
                newChannel.name
            ) {
                changes.push(
                    formatLogLine(
                        'Name',
                        `${oldChannel.name} → ${newChannel.name}`
                    )
                );
            }


            // TOPIC
            if (
                oldChannel.topic !==
                newChannel.topic
            ) {
                changes.push(
                    formatLogLine(
                        'Topic',
                        `${oldChannel.topic || 'None'} → ${newChannel.topic || 'None'}`
                    )
                );
            }


            // CATEGORY
            if (
                oldChannel.parentId !==
                newChannel.parentId
            ) {
                changes.push(
                    formatLogLine(
                        'Category',
                        `${
                            oldChannel.parentId
                                ? `<#${oldChannel.parentId}>`
                                : 'None'
                        } → ${
                            newChannel.parentId
                                ? `<#${newChannel.parentId}>`
                                : 'None'
                        }`
                    )
                );
            }


            // SLOWMODE
            if (
                oldChannel.rateLimitPerUser !==
                newChannel.rateLimitPerUser
            ) {
                changes.push(
                    formatLogLine(
                        'Slowmode',
                        `${oldChannel.rateLimitPerUser || 0}s → ${newChannel.rateLimitPerUser || 0}s`
                    )
                );
            }


            // NSFW
            if (
                oldChannel.nsfw !==
                newChannel.nsfw
            ) {
                changes.push(
                    formatLogLine(
                        'NSFW',
                        `${oldChannel.nsfw ? 'Yes' : 'No'} → ${newChannel.nsfw ? 'Yes' : 'No'}`
                    )
                );
            }


            // VOICE BITRATE
            if (
                oldChannel.bitrate !==
                newChannel.bitrate
            ) {
                changes.push(
                    formatLogLine(
                        'Bitrate',
                        `${oldChannel.bitrate || 0} → ${newChannel.bitrate || 0}`
                    )
                );
            }


            // VOICE USER LIMIT
            if (
                oldChannel.userLimit !==
                newChannel.userLimit
            ) {
                changes.push(
                    formatLogLine(
                        'User Limit',
                        `${oldChannel.userLimit || 0} → ${newChannel.userLimit || 0}`
                    )
                );
            }


            // VIDEO QUALITY
            if (
                oldChannel.videoQualityMode !==
                newChannel.videoQualityMode
            ) {
                changes.push(
                    formatLogLine(
                        'Video Quality',
                        `${oldChannel.videoQualityMode ?? 'None'} → ${newChannel.videoQualityMode ?? 'None'}`
                    )
                );
            }


            // PERMISSIONS
            if (
                permissionOverwritesChanged(
                    oldChannel,
                    newChannel
                )
            ) {
                changes.push(
                    formatLogLine(
                        'Permissions',
                        'Permission overwrites changed'
                    )
                );
            }


            /*
             * POSITION IS INTENTIONALLY NOT CHECKED.
             *
             * Moving:
             * - Text channels
             * - Voice channels
             * - Categories
             * - Stage channels
             * - Forum channels
             *
             * will NOT create a log.
             */


            if (!changes.length) {
                return;
            }


            await logEvent({
                client: newChannel.client,
                guildId: newChannel.guild.id,
                eventType: EVENT_TYPES.CHANNEL_UPDATE,

                data: {
                    title: '📁 Channel Edited',

                    lines: [
                        formatLogLine(
                            'Channel',
                            `${newChannel} • \`${newChannel.id}\``
                        ),

                        ...changes,
                    ],

                    quoted: false,
                },
            });

        } catch (error) {
            logger.error(
                'Error in channelUpdate:',
                error
            );
        }
    },
};
