import {
    MessageFlags,
} from 'discord.js';

import {
    getTicketPermissionContext,
} from '../../../utils/ticket/ticketPermissions.js';

import {
    updateTicketPriority,
} from '../../../services/ticket.js';

import {
    successEmbed,
} from '../../../utils/embeds.js';

import {
    replyUserError,
    ErrorTypes,
} from '../../../utils/errorHandler.js';

import {
    logger,
} from '../../../utils/logger.js';


const PRIORITY_LABELS = {
    none: '⚪ NONE',
    low: '🟢 LOW',
    medium: '🟡 MEDIUM',
    high: '🔴 HIGH',
    urgent: '🚨 URGENT',
};


export default {
    name: 'ticket_priority_select',

    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                return;
            }

            const context =
                await getTicketPermissionContext({
                    client,
                    interaction,
                });

            if (!context.ticketData) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message:
                        'This action can only be used inside a ticket.',
                });

                return;
            }

            if (!context.canManageTicket) {
                await replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message:
                        'You must have **Manage Channels** or the configured **Ticket Staff Role** to change ticket priority.',
                });

                return;
            }

            const priority =
                interaction.values?.[0];

            const validPriorities = [
                'none',
                'low',
                'medium',
                'high',
                'urgent',
            ];

            if (
                !validPriorities.includes(
                    priority
                )
            ) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message:
                        'Invalid priority selected.',
                });

                return;
            }

            await updateTicketPriority(
                interaction.channel,
                priority,
                interaction.user
            );

            await interaction.update({
                content:
                    `### ✅ Priority Updated\nTicket priority has been set to **${PRIORITY_LABELS[priority]}**.`,
                components: [],
                embeds: [],
            });

        } catch (error) {
            logger.error(
                'Error selecting ticket priority:',
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        error?.userMessage ||
                        'An error occurred while updating ticket priority.',
                });
            }
        }
    },
};
