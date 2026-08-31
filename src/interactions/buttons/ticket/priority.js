import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';

import { logger } from '../../../utils/logger.js';
import {
  ErrorTypes,
  replyUserError,
} from '../../../utils/errorHandler.js';
import { getTicketPermissionContext } from '../../../utils/ticket/ticketPermissions.js';

const PRIORITY_OPTIONS = [
  {
    label: '🔴 Urgent',
    description: 'Critical issue requiring immediate attention',
    value: 'urgent',
  },
  {
    label: '🟠 High',
    description: 'Important issue that should be handled soon',
    value: 'high',
  },
  {
    label: '🟡 Medium',
    description: 'Normal priority ticket',
    value: 'medium',
  },
  {
    label: '🟢 Low',
    description: 'Non-urgent request',
    value: 'low',
  },
];

function buildPriorityMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_priority_select')
    .setPlaceholder('Select a ticket priority...')
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

/*
 * Priority BUTTON
 *
 * This opens the priority selector.
 */
export const priorityDropdownButton = {
  name: 'ticket_priority',

  async execute(interaction, client) {
    try {
      if (!interaction.isButton()) {
        return;
      }

      const permissionContext =
        await getTicketPermissionContext({
          client,
          interaction,
        });

      if (!permissionContext.ticketData) {
        await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message:
            'This button can only be used inside a valid ticket.',
        });

        return;
      }

      if (!permissionContext.canManageTicket) {
        await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message:
            'You do not have permission to change the ticket priority.',
        });

        return;
      }

      await interaction.reply({
        content: '🎯 **Select the priority for this ticket:**',
        components: [buildPriorityMenu()],
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
        }).catch(() => {});
      }
    }
  },
};

/*
 * Priority SELECT MENU
 *
 * This handles the actual selection.
 */
export const prioritySelectMenu = {
  name: 'ticket_priority_select',

  async execute(interaction, client) {
    try {
      if (!interaction.isStringSelectMenu()) {
        return;
      }

      const selectedPriority =
        interaction.values?.[0];

      if (
        !PRIORITY_OPTIONS.some(
          (option) =>
            option.value === selectedPriority
        )
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message:
            'That is not a valid ticket priority.',
        });

        return;
      }

      const permissionContext =
        await getTicketPermissionContext({
          client,
          interaction,
        });

      if (!permissionContext.ticketData) {
        await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message:
            'This action can only be used inside a valid ticket.',
        });

        return;
      }

      if (!permissionContext.canManageTicket) {
        await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message:
            'You do not have permission to change the ticket priority.',
        });

        return;
      }

      const priority =
        PRIORITY_OPTIONS.find(
          (option) =>
            option.value === selectedPriority
        );

      /*
       * For now we update the ticket channel name.
       *
       * This avoids relying on a deleted/missing database
       * function and keeps the ticket system functional.
       */
      const channel = interaction.channel;

      if (!channel) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'The ticket channel could not be found.',
        });

        return;
      }

      /*
       * Keep the existing ticket name intact and only add
       * the priority indicator if it isn't already present.
       */
      let newName = channel.name
        .replace(/^🔴-|^🟠-|^🟡-|^🟢-/u, '');

      newName = `${priority.value}-${newName}`;

      await channel.setName(newName);

      await interaction.update({
        content:
          `✅ Ticket priority set to **${priority.label}**.`,
        components: [],
      });

      logger.info(
        'Ticket priority changed successfully',
        {
          guildId: interaction.guildId,
          channelId: channel.id,
          userId: interaction.user.id,
          priority: selectedPriority,
        }
      );
    } catch (error) {
      logger.error(
        'Error changing ticket priority:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'Could not change the ticket priority.',
        }).catch(() => {});
      }
    }
  },
};

export default [
  priorityDropdownButton,
  prioritySelectMenu,
];
