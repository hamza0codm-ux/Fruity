import { Events } from 'discord.js';

import {
    logEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    logger,
} from '../utils/logger.js';

import {
    formatLogLine,
} from '../utils/logging/logEmbeds.js';


const MAX_CONTENT = 512;


export default {

    name:
        Events.MessageUpdate,

    once:
        false,

    async execute(
        oldMessage,
        newMessage
    ) {

        try {

            if (!newMessage.guild) {
                return;
            }


            if (
                newMessage.author?.bot
            ) {
                return;
            }


            /*
             * Ignore Discord's internal
             * non-content updates.
             */

            if (
                oldMessage.content ===
                newMessage.content
            ) {
                return;
            }


            let before =
                oldMessage.content ||
                '*(empty message)*';


            let after =
                newMessage.content ||
                '*(empty message)*';


            if (
                before.length >
                MAX_CONTENT
            ) {

                before =
                    `${before.substring(
                        0,
                        MAX_CONTENT - 3
                    )}...`;
            }


            if (
                after.length >
                MAX_CONTENT
            ) {

                after =
                    `${after.substring(
                        0,
                        MAX_CONTENT - 3
                    )}...`;
            }


            const lines = [

                formatLogLine(
                    'Channel',
                    `${newMessage.channel} • ${newMessage.channel.name}`
                ),

                formatLogLine(
                    'Message ID',
                    `\`${newMessage.id}\``
                ),

                formatLogLine(
                    'Author',
                    newMessage.author
                        ? `${newMessage.author} • ${newMessage.author.tag}`
                        : 'Unknown'
                ),
            ];


            await logEvent({

                client:
                    newMessage.client,

                guildId:
                    newMessage.guild.id,

                eventType:
                    EVENT_TYPES.MESSAGE_EDIT,

                data: {

                    title:
                        '✏️ Message Edited',

                    lines,

                    quoted:
                        false,

                    fields: [

                        {
                            name:
                                'Before',

                            value:
                                before,

                            inline:
                                true,
                        },

                        {
                            name:
                                'After',

                            value:
                                after,

                            inline:
                                true,
                        },
                    ],

                    userId:
                        newMessage.author?.id,

                    channelId:
                        newMessage.channel?.id,
                },
            });

        } catch (error) {

            logger.error(
                'Error in messageUpdate:',
                error
            );
        }
    },
};
