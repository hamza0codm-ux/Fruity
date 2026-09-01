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


const MESSAGE_LOG_CHANNEL =
    '1542858198233653348';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH =
    1024;


export default {

    name: Events.MessageDelete,

    once: false,

    async execute(message) {

        try {

            /*
             * Ignore DMs.
             */
            if (!message.guild) {
                return;
            }


            /*
             * =====================================
             * REACTION ROLE CLEANUP
             * =====================================
             */

            try {

                const reactionRoleData =
                    await getReactionRoleMessage(
                        message.client,
                        message.guild.id,
                        message.id
                    );


                if (reactionRoleData) {

                    await deleteReactionRoleMessage(
                        message.client,
                        message.guild.id,
                        message.id
                    );


                    logger.info(
                        `Cleaned up reaction role database entry for deleted message ${message.id} in guild ${message.guild.id}`
                    );


                    try {

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

                                quoted: false,
                            },

                            channelId:
                                MESSAGE_LOG_CHANNEL,
                        });

                    } catch (logCleanupError) {

                        logger.warn(
                            'Failed to log reaction role cleanup:',
                            logCleanupError
                        );
                    }
                }

            } catch (reactionRoleCleanupError) {

                logger.warn(
                    `Failed to clean up reaction role data for deleted message ${message.id}:`,
                    reactionRoleCleanupError
                );
            }


            /*
             * =====================================
             * IGNORE BOT MESSAGES
             * =====================================
             *
             * This prevents the bot from logging
             * its own messages.
             */

            if (message.author?.bot) {
                return;
            }


            /*
             * =====================================
             * BASIC MESSAGE INFORMATION
             * =====================================
             */

            const metaLines = [];


            metaLines.push(
                formatLogLine(
                    'Channel',
                    message.channel
                        ? `${message.channel} • ${message.channel.name}`
                        : 'Unknown'
                )
            );


            metaLines.push(
                formatLogLine(
                    'Message ID',
                    `\`${message.id}\``
                )
            );


            metaLines.push(
                formatLogLine(
                    'Author',
                    message.author
                        ? `${message.author} • ${message.author.tag}`
                        : 'Unknown / unavailable'
                )
            );


            /*
             * message.createdTimestamp can be
             * unavailable for partial messages.
             */

            if (
                message.createdTimestamp &&
                !Number.isNaN(
                    message.createdTimestamp
                )
            ) {

                metaLines.push(
                    formatLogLine(
                        'Message created',
                        `<t:${Math.floor(
                            message.createdTimestamp / 1000
                        )}:R>`
                    )
                );
            }


            /*
             * =====================================
             * MESSAGE CONTENT
             * =====================================
             */

            let messageBody = null;


            if (message.content) {

                messageBody =
                    message.content.length >
                    MAX_LOGGED_MESSAGE_CONTENT_LENGTH

                        ? `${message.content.substring(
                            0,
                            MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3
                        )}...`

                        : message.content;
            }


            /*
             * =====================================
             * ATTACHMENTS
             * =====================================
             */

            if (
                message.attachments &&
                message.attachments.size > 0
            ) {

                metaLines.push(
                    formatLogLine(
                        'Attachments',
                        String(
                            message.attachments.size
                        )
                    )
                );
            }


            /*
             * =====================================
             * EMBEDS
             * =====================================
             */

            if (
                message.embeds &&
                message.embeds.length > 0
            ) {

                metaLines.push(
                    formatLogLine(
                        'Embeds',
                        String(
                            message.embeds.length
                        )
                    )
                );
            }


            /*
             * =====================================
             * LOG DELETED MESSAGE
             * =====================================
             */

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

                    lines:
                        metaLines,

                    quoted: false,

                    section: {

                        title:
                            'Deleted Message',

                        body:
                            messageBody ||
                            '*(message content unavailable)*',
                    },

                    userId:
                        message.author?.id ||
                        null,

                    channelId:
                        message.channel?.id ||
                        null,
                },

                /*
                 * Force the message logging
                 * destination.
                 */
                channelId:
                    MESSAGE_LOG_CHANNEL,
            });


        } catch (error) {

            logger.error(
                'Error in messageDelete event:',
                error
            );
        }
    },
};
