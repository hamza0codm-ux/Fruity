import { Events } from 'discord.js';

import {
    logEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    logger,
} from '../utils/logger.js';

import {
    getReactionRoleMessage,
    deleteReactionRoleMessage,
} from '../services/reactionRoleService.js';

import {
    formatLogLine,
} from '../utils/logging/logEmbeds.js';


const MAX_CONTENT = 1024;


export default {

    name:
        Events.MessageDelete,

    once:
        false,

    async execute(message) {

        try {

            if (!message.guild) {
                return;
            }


            /*
             * Reaction-role cleanup
             */

            try {

                const reactionRole =
                    await getReactionRoleMessage(
                        message.client,
                        message.guild.id,
                        message.id
                    );


                if (reactionRole) {

                    await deleteReactionRoleMessage(
                        message.client,
                        message.guild.id,
                        message.id
                    );


                    await logEvent({

                        client:
                            message.client,

                        guildId:
                            message.guild.id,

                        eventType:
                            EVENT_TYPES.REACTION_ROLE_DELETE,

                        data: {

                            title:
                                '🗑️ Reaction Role Removed',

                            lines: [

                                formatLogLine(
                                    'Channel',
                                    message.channel
                                        ? `${message.channel} • ${message.channel.name}`
                                        : 'Unknown'
                                ),

                                formatLogLine(
                                    'Message ID',
                                    `\`${message.id}\``
                                ),

                                formatLogLine(
                                    'Cleanup',
                                    'Database entry removed automatically'
                                ),
                            ],

                            quoted:
                                false,
                        },
                    });
                }

            } catch (error) {

                logger.warn(
                    'Reaction-role cleanup failed:',
                    error
                );
            }


            /*
             * Don't log bot messages.
             */

            if (message.author?.bot) {
                return;
            }


            const lines = [

                formatLogLine(
                    'Channel',
                    message.channel
                        ? `${message.channel} • ${message.channel.name}`
                        : 'Unknown'
                ),

                formatLogLine(
                    'Message ID',
                    `\`${message.id}\``
                ),

                formatLogLine(
                    'Author',
                    message.author
                        ? `${message.author} • ${message.author.tag}`
                        : 'Unknown'
                ),
            ];


            if (
                message.createdTimestamp
            ) {

                lines.push(
                    formatLogLine(
                        'Created',
                        `<t:${Math.floor(
                            message.createdTimestamp / 1000
                        )}:R>`
                    )
                );
            }


            if (
                message.attachments?.size
            ) {

                lines.push(
                    formatLogLine(
                        'Attachments',
                        String(
                            message.attachments.size
                        )
                    )
                );
            }


            let content =
                message.content ||
                '*(message content unavailable)*';


            if (
                content.length >
                MAX_CONTENT
            ) {

                content =
                    `${content.substring(
                        0,
                        MAX_CONTENT - 3
                    )}...`;
            }


            await logEvent({

                client:
                    message.client,

                guildId:
                    message.guild.id,

                eventType:
                    EVENT_TYPES.MESSAGE_DELETE,

                data: {

                    title:
                        '🗑️ Message Deleted',

                    lines,

                    quoted:
                        false,

                    section: {

                        title:
                            'Message',

                        body:
                            content,
                    },

                    userId:
                        message.author?.id,

                    channelId:
                        message.channel?.id,
                },
            });

        } catch (error) {

            logger.error(
                'Error in messageDelete:',
                error
            );
        }
    },
};
