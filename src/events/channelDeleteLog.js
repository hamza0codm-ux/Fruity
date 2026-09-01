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

    name: Events.ChannelDelete,

    once: false,

    async execute(channel) {

        try {

            if (!channel.guild) {
                return;
            }

            await logEvent({

                client:
                    channel.client,

                guildId:
                    channel.guild.id,

                eventType:
                    EVENT_TYPES.CHANNEL_DELETE,

                data: {

                    title:
                        '📁 Channel Deleted',

                    lines: [

                        formatLogLine(
                            'Channel',
                            `#${channel.name}`
                        ),

                        formatLogLine(
                            'Channel ID',
                            `\`${channel.id}\``
                        ),

                        formatLogLine(
                            'Type',
                            String(channel.type)
                        ),
                    ],

                    quoted: false,
                },
            });

        } catch (error) {

            logger.error(
                'Error in channelDelete logging:',
                error
            );
        }
    },
};
