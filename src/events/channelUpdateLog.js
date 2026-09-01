import { Events } from 'discord.js';

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


            if (
                oldChannel.position !==
                newChannel.position
            ) {

                changes.push(
                    formatLogLine(
                        'Position',
                        `${oldChannel.position} → ${newChannel.position}`
                    )
                );
            }


            if (changes.length === 0) {
                return;
            }


            await logEvent({

                client:
                    newChannel.client,

                guildId:
                    newChannel.guild.id,

                eventType:
                    EVENT_TYPES.CHANNEL_UPDATE,

                data: {

                    title:
                        '📁 Channel Updated',

                    lines: [

                        formatLogLine(
                            'Channel',
                            `${newChannel} • \`${newChannel.id}\``
                        ),

                        ...changes,
                    ],

                    quoted: false,

                    channelId:
                        newChannel.id,
                },
            });

        } catch (error) {

            logger.error(
                'Error in channelUpdate logging:',
                error
            );
        }
    },
};
