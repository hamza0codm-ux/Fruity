import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';

import { logger } from '../../../utils/logger.js';
import {
  ErrorTypes,
  replyUserError,
} from '../../../utils/errorHandler.js';

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

export const priorityDropdownButton = {
  name: 'ticket_priority',

  async execute(interaction, client, args = []) {
    try {
      if (!interaction.isButton()) {
        return;
      }

      const ticketChannel = interaction.channel;

      if (!ticketChannel) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'This ticket channel could not be found.',
        }).catch(() => {});

        return;
      }

      await interaction.reply({
        content: '🎯 Select the priority for this ticket:',
        components: [buildPriorityMenu()],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Error opening ticket priority menu:', error);

      if (!interaction.replied && !interaction.deferred) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Could not open the priority menu.',
        }).catch(() => {});
      }
    }
  },
};

export default priorityDropdownButton;
