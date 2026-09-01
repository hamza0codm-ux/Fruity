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

    name: Events.GuildRoleCreate,

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
                    EVENT_TYPES.ROLE_CREATE,

                data: {

                    title:
                        '🎭 Role Created',

                    lines: [

                        formatLogLine(
                            'Role',
                            `${role} • ${role.name}`
                        ),

                        formatLogLine(
                            'Role ID',
                            `\`${role.id}\``
                        ),

                        formatLogLine(
                            'Colour',
                            role.hexColor ||
                            '#000000'
                        ),
                    ],

                    quoted: false,
                },
            });

        } catch (error) {

            logger.error(
                'Error in roleCreate logging:',
                error
            );
        }
    },
};
