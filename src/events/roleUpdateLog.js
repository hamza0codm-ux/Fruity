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

    name: Events.GuildRoleUpdate,

    once: false,

    async execute(
        oldRole,
        newRole
    ) {

        try {

            if (!newRole.guild) {
                return;
            }

            const changes = [];


            if (
                oldRole.name !==
                newRole.name
            ) {

                changes.push(
                    formatLogLine(
                        'Name',
                        `${oldRole.name} → ${newRole.name}`
                    )
                );
            }


            if (
                oldRole.hexColor !==
                newRole.hexColor
            ) {

                changes.push(
                    formatLogLine(
                        'Colour',
                        `${oldRole.hexColor} → ${newRole.hexColor}`
                    )
                );
            }


            if (
                oldRole.hoist !==
                newRole.hoist
            ) {

                changes.push(
                    formatLogLine(
                        'Hoisted',
                        `${oldRole.hoist ? 'Yes' : 'No'} → ${newRole.hoist ? 'Yes' : 'No'}`
                    )
                );
            }


            if (
                oldRole.mentionable !==
                newRole.mentionable
            ) {

                changes.push(
                    formatLogLine(
                        'Mentionable',
                        `${oldRole.mentionable ? 'Yes' : 'No'} → ${newRole.mentionable ? 'Yes' : 'No'}`
                    )
                );
            }


            if (
                oldRole.permissions.bitfield !==
                newRole.permissions.bitfield
            ) {

                changes.push(
                    formatLogLine(
                        'Permissions',
                        'Permissions changed'
                    )
                );
            }


            if (
                oldRole.position !==
                newRole.position
            ) {

                changes.push(
                    formatLogLine(
                        'Position',
                        `${oldRole.position} → ${newRole.position}`
                    )
                );
            }


            if (changes.length === 0) {
                return;
            }


            await logEvent({

                client:
                    newRole.client,

                guildId:
                    newRole.guild.id,

                eventType:
                    EVENT_TYPES.ROLE_UPDATE,

                data: {

                    title:
                        '🎭 Role Updated',

                    lines: [

                        formatLogLine(
                            'Role',
                            `${newRole} • ${newRole.name}`
                        ),

                        formatLogLine(
                            'Role ID',
                            `\`${newRole.id}\``
                        ),

                        ...changes,
                    ],

                    quoted: false,
                },
            });

        } catch (error) {

            logger.error(
                'Error in roleUpdate logging:',
                error
            );
        }
    },
};
