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

    name: Events.GuildRoleDelete,

    once: false,

    async execute(role) {

        try {

            if (!role.guild) {
                return;
            }

            await logEvent({

                client:
                    role.client,

                guildId:
                    role.guild.id,

                eventType:
                    EVENT_TYPES.ROLE_DELETE,

                data: {

                    title:
                        '🎭 Role Deleted',

                    lines: [

                        formatLogLine(
                            'Role',
                            role.name
                        ),

                        formatLogLine(
                            'Role ID',
                            `\`${role.id}\``
                        ),
                    ],

                    quoted: false,
                },
            });

        } catch (error) {

            logger.error(
                'Error in roleDelete logging:',
                error
            );
        }
    },
};
