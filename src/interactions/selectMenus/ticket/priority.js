// src/interactions/selectMenus/ticket/priority.js

import {
    getTicketPermissionContext,
} from '../../../utils/ticket/ticketPermissions.js';

import {
    updateTicketPriority,
} from '../../../services/ticket.js';

import {
    replyUserError,
    ErrorTypes,
} from '../../../utils/errorHandler.js';

import {
    logger,
} from '../../../utils/logger.js';

const PRIORITY_OPTIONS = [
    {
        label: 'None',
        value: 'none',
    },
    {
        label: '🟢 Low',
        value: 'low',
    },
    {
        label: '🟡 Medium',
        value: 'medium',
    },
    {
        label: '🔴 High',
        value: 'high',
    },
    {
        label: '🚨 Urgent',
        value: 'urgent',
    },
];

export default {
    name: 'ticket_priority_select',

    async execute(interaction, client) {
        try {
            if (!interaction.isStringSelectMenu()) {
                return;
            }

            if (!interaction.inGuild()) {
                return;
            }

            // Make sure this is actually a ticket
            const context = await getTicketPermissionContext({
                client,
                interaction,
            });

            if (!context?.ticketData) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'This action can only be used inside a ticket.',
                }).catch(() => {});

                return;
            }

            // Check staff permissions
            if (!context.canManageTicket) {
                await replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message:
                        'You must have **Manage Channels** or the configured **Ticket Staff Role** to change ticket priority.',
                }).catch(() => {});

                return;
            }

            const priority = interaction.values?.[0];

            const validPriorities = [
                'none',
                'low',
                'medium',
                'high',
                'urgent',
            ];

            if (!priority || !validPriorities.includes(priority)) {
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Invalid priority selected.',
                }).catch(() => {});

                return;
            }

            logger.info('Updating ticket priority', {
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                priority,
            });

            // THIS is what actually changes the ticket
            await updateTicketPriority(
                interaction.channel,
                priority,
                interaction.user
            );

            const priorityNames = {
                none: 'None',
                low: '🟢 Low',
                medium: '🟡 Medium',
                high: '🔴 High',
                urgent: '🚨 Urgent',
            };

            // Close the dropdown after successful update
            await interaction.update({
                content:
                    `### ✅ Priority Updated\n` +
                    `Ticket priority has been set to **${priorityNames[priority]}**.`,
                components: [],
            });

            logger.info('Ticket priority updated successfully', {
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                priority,
            });

        } catch (error) {
            logger.error('Error selecting ticket priority:', {
                error: error?.message,
                stack: error?.stack,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user?.id,
                selectedValue: interaction.values?.[0],
            });

            if (!interaction.replied && !interaction.deferred) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        error?.userMessage ||
                        'An error occurred while updating the ticket priority.',
                }).catch(() => {});
            } else {
                await interaction.editReply({
                    content:
                        '❌ Failed to update the ticket priority. Please try again.',
                    components: [],
                }).catch(() => {});
            }
        }
    },
};
