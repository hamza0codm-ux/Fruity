import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
} from 'discord.js';

import {
    getTicketPermissionContext,
} from '../../../utils/ticket/ticketPermissions.js';

import {
    replyUserError,
    ErrorTypes,
} from '../../../utils/errorHandler.js';

import { logger } from '../../../utils/logger.js';


export const priorityDropdownButton = {
    name: 'ticket_priority_menu',

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

            const menu =
                new StringSelectMenuBuilder()
                    .setCustomId(
                        'ticket_priority_select'
                    )
                    .setPlaceholder(
                        'Select ticket priority...'
                    )
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('None')
                            .setDescription(
                                'Remove the ticket priority'
                            )
                            .setValue('none')
                            .setEmoji('⚪'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Low')
                            .setDescription(
                                'Set this ticket to low priority'
                            )
                            .setValue('low')
                            .setEmoji('🟢'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Medium')
                            .setDescription(
                                'Set this ticket to medium priority'
                            )
                            .setValue('medium')
                            .setEmoji('🟡'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('High')
                            .setDescription(
                                'Set this ticket to high priority'
                            )
                            .setValue('high')
                            .setEmoji('🔴'),

                        new StringSelectMenuOptionBuilder()
                            .setLabel('Urgent')
                            .setDescription(
                                'Set this ticket to urgent priority'
                            )
                            .setValue('urgent')
                            .setEmoji('🚨')
                    );

            const row =
                new ActionRowBuilder()
                    .addComponents(menu);

            await interaction.reply({
                content:
                    '### 🎯 Ticket Priority\nSelect the priority for this ticket:',
                components: [row],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error(
                'Error opening ticket priority menu:',
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        'Could not open the priority menu.',
                });
            }
        }
    },
};
