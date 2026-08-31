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

import {
    logger,
} from '../../../utils/logger.js';


const PRIORITY_OPTIONS = [
    {
        label: '⚪ None',
        description: 'Remove the current ticket priority',
        value: 'none',
    },
    {
        label: '🟢 Low',
        description: 'Low priority ticket',
        value: 'low',
    },
    {
        label: '🟡 Medium',
        description: 'Normal priority ticket',
        value: 'medium',
    },
    {
        label: '🔴 High',
        description: 'High priority ticket',
        value: 'high',
    },
    {
        label: '🚨 Urgent',
        description: 'Critical ticket requiring immediate attention',
        value: 'urgent',
    },
];


function buildPriorityMenu() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_priority_select')
        .setPlaceholder('Select ticket priority...')
        .addOptions(
            PRIORITY_OPTIONS.map((option) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(option.label)
                    .setDescription(option.description)
                    .setValue(option.value)
            )
        );

    return new ActionRowBuilder().addComponents(menu);
}


export default {
    name: 'ticket_priority',

    async execute(interaction, client) {
        try {
            if (!interaction.isButton()) {
                return;
            }

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

            await interaction.reply({
                content:
                    '### 🎯 Ticket Priority\nSelect the priority you want to set for this ticket.',
                components: [
                    buildPriorityMenu(),
                ],
                flags: MessageFlags.Ephemeral,
            });

            logger.info(
                'Ticket priority menu opened',
                {
                    guildId: interaction.guildId,
                    channelId: interaction.channelId,
                    userId: interaction.user.id,
                }
            );

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
                        'An error occurred while opening the priority menu.',
                }).catch(() => {});
            }
        }
    },
};
