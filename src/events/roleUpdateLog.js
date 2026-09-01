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


            // Name
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


            // Colour
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


            // Hoisted
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


            // Mentionable
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


            // Permissions
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


            /*
             * IMPORTANT:
             * Role position changes are intentionally
             * NOT logged.
             *
             * Discord fires GuildRoleUpdate when a role
             * is moved, so we simply don't check position.
             */


            // Nothing useful changed
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
                        '🎭 Role Edited',

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

                    quoted:
                        false,
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
