import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';

import { createEmbed, successEmbed } from '../utils/embeds.js';
import {
  createTicket,
  closeTicket,
  claimTicket,
  updateTicketPriority,
} from '../services/ticket.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import {
  replyUserError,
  ErrorTypes,
  handleInteractionError,
  createError,
} from '../utils/errorHandler.js';
import { getTicketPermissionContext } from '../utils/ticket/ticketPermissions.js';

function escapeHtml(text) {
  if (!text) return '';

  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function ensureGuildContext(interaction) {
  if (interaction.inGuild()) {
    return true;
  }

  if (!interaction.replied && !interaction.deferred) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message: 'This action can only be used in a server.',
    });
  }

  return false;
}

async function assertTicketPermission(
  interaction,
  client,
  actionLabel,
  options = {},
  timeoutMs = 2500
) {
  const { allowTicketCreator = false } = options;

  let context;

  try {
    const contextPromise = getTicketPermissionContext({
      client,
      interaction,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );

    context = await Promise.race([
      contextPromise,
      timeoutPromise,
    ]);
  } catch (error) {
    if (error.message === 'Timeout') {
      throw createError(
        'Ticket permission timeout',
        ErrorTypes.RATE_LIMIT,
        'The permission check took too long. Please try again.'
      );
    }

    throw createError(
      'Ticket permission check failed',
      ErrorTypes.UNKNOWN,
      `Failed to check permissions: ${error.message}`
    );
  }

  if (!context.ticketData) {
    throw createError(
      'Not a ticket channel',
      ErrorTypes.VALIDATION,
      'This action can only be used in a valid ticket channel.'
    );
  }

  const allowed = allowTicketCreator
    ? context.canCloseTicket
    : context.canManageTicket;

  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'You must have **Manage Channels**, the configured **Ticket Staff Role**, or be the **ticket creator**.'
      : 'You must have **Manage Channels** or the configured **Ticket Staff Role**.';

    throw createError(
      'Ticket permission denied',
      ErrorTypes.PERMISSION,
      `${permissionMessage}\n\nYou cannot ${actionLabel}.`
    );
  }

  return context;
}

async function ensureTicketPermission(
  interaction,
  client,
  actionLabel,
  options = {}
) {
  const { allowTicketCreator = false } = options;

  const context = await getTicketPermissionContext({
    client,
    interaction,
  });

  if (!context.ticketData) {
    await replyUserError(interaction, {
      type: ErrorTypes.UNKNOWN,
      message:
        'This action can only be used in a valid ticket channel.',
    });

    return null;
  }

  const allowed = allowTicketCreator
    ? context.canCloseTicket
    : context.canManageTicket;

  if (!allowed) {
    const permissionMessage = allowTicketCreator
      ? 'You must have **Manage Channels**, the configured **Ticket Staff Role**, or be the **ticket creator**.'
      : 'You must have **Manage Channels** or the configured **Ticket Staff Role**.';

    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message:
        `${permissionMessage}\n\nYou cannot ${actionLabel}.`,
    });

    return null;
  }

  return context;
}


/* ============================================================
   CREATE TICKET
   ============================================================ */

const createTicketHandler = {
  name: 'create_ticket',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const rateLimitKey =
        `${interaction.user.id}:create_ticket`;

      const allowed = await checkRateLimit(
        rateLimitKey,
        3,
        60000
      );

      if (!allowed) {
        await replyUserError(interaction, {
          type: ErrorTypes.RATE_LIMIT,
          message:
            'You are creating tickets too quickly. Please wait a minute and try again.',
        });

        return;
      }

      const config = await getGuildConfig(
        client,
        interaction.guildId
      );

      const maxTicketsPerUser =
        config.maxTicketsPerUser || 3;

      const { getUserTicketCount } =
        await import('../services/ticket.js');

      const currentTicketCount =
        await getUserTicketCount(
          interaction.guildId,
          interaction.user.id
        );

      if (currentTicketCount >= maxTicketsPerUser) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            `You have reached the maximum number of open tickets (${maxTicketsPerUser}).\n\n` +
            `Please close your existing tickets before creating a new one.\n\n` +
            `**Current Tickets:** ${currentTicketCount}/${maxTicketsPerUser}`,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('create_ticket_modal')
        .setTitle('Create a Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Why are you creating this ticket?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe your issue...')
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          reasonInput
        )
      );

      await interaction.showModal(modal);
    } catch (error) {
      logger.error(
        'Error creating ticket modal:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'Could not open ticket creation form.',
        });
      }
    }
  },
};


/* ============================================================
   CREATE TICKET MODAL
   ============================================================ */

const createTicketModalHandler = {
  name: 'create_ticket_modal',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      const deferSuccess =
        await InteractionHelper.safeDefer(
          interaction,
          { flags: MessageFlags.Ephemeral }
        );

      if (!deferSuccess) return;

      const reason =
        interaction.fields.getTextInputValue(
          'reason'
        );

      const config =
        await getGuildConfig(
          client,
          interaction.guildId
        );

      const categoryId =
        config.ticketCategoryId || null;

      const { channel } =
        await createTicket(
          interaction.guild,
          interaction.member,
          categoryId,
          reason
        );

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Ticket Created',
            `Your ticket has been created in ${channel}!`
          ),
        ],
      });
    } catch (error) {
      await handleInteractionError(
        interaction,
        error,
        {
          type: 'modal',
          handler: 'ticket',
          customId: interaction.customId,
        }
      );
    }
  },
};


/* ============================================================
   CLOSE BUTTON
   ============================================================ */

const closeTicketHandler = {
  name: 'ticket_close',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'close this ticket',
        { allowTicketCreator: true },
        2500
      );

      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Close Ticket');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(
          'Add an optional reason for closing this ticket...'
        )
        .setRequired(false)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          reasonInput
        )
      );

      await interaction.showModal(modal);
    } catch (error) {
      logger.error(
        'Error opening close ticket modal:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'Could not open ticket close form.',
        });
      }
    }
  },
};


/* ============================================================
   CLOSE MODAL
   ============================================================ */

const closeTicketModalHandler = {
  name: 'ticket_close_modal',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'close this ticket',
        { allowTicketCreator: true },
        2500
      );

      const reason =
        (
          interaction.fields.getTextInputValue(
            'reason'
          ) || ''
        ).trim() ||
        'Closed via ticket button without a specific reason.';

      /*
       * ACKNOWLEDGE THE MODAL FIRST.
       *
       * This prevents Discord's interaction from timing
       * out while closeTicket performs database/log work.
       */
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      await closeTicket(
        interaction.channel,
        interaction.user,
        reason
      );

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Ticket Closed',
            'This ticket has been closed.'
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Error submitting close ticket modal:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            `An error occurred while closing the ticket: ${
              error?.message || 'Unknown error'
            }`,
        });
      } else {
        await interaction.editReply({
          embeds: [
            createEmbed({
              title: '❌ Close Failed',
              description:
                `An error occurred while closing the ticket:\n\n${
                  error?.message || 'Unknown error'
                }`,
              color: 0xED4245,
            }),
          ],
        }).catch(() => {});
      }
    }
  },
};


/* ============================================================
   PRIORITY BUTTON
   ============================================================ */

/*
 * IMPORTANT:
 *
 * The old button was:
 *
 *     ticket_priority_menu
 *
 * but there was no matching button handler.
 *
 * This handler now opens a modal so it works directly
 * through client.buttons without requiring a select-menu
 * registration.
 */

const priorityMenuHandler = {
  name: 'ticket_priority_menu',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'change ticket priority',
        {},
        2500
      );

      const modal = new ModalBuilder()
        .setCustomId('ticket_priority_modal')
        .setTitle('Ticket Priority');

      const priorityInput = new TextInputBuilder()
        .setCustomId('priority')
        .setLabel(
          'Priority: none, low, medium, high, urgent'
        )
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(
          'Example: high'
        )
        .setRequired(true)
        .setMaxLength(20);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          priorityInput
        )
      );

      await interaction.showModal(modal);
    } catch (error) {
      logger.error(
        'Error opening priority modal:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'Could not open the priority form.',
        });
      }
    }
  },
};


/* ============================================================
   PRIORITY MODAL
   ============================================================ */

const priorityModalHandler = {
  name: 'ticket_priority_modal',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'change ticket priority',
        {},
        2500
      );

      const priority =
        (
          interaction.fields.getTextInputValue(
            'priority'
          ) || ''
        )
          .trim()
          .toLowerCase();

      const allowedPriorities = [
        'none',
        'low',
        'medium',
        'high',
        'urgent',
      ];

      if (
        !allowedPriorities.includes(priority)
      ) {
        await interaction.reply({
          embeds: [
            createEmbed({
              title: '❌ Invalid Priority',
              description:
                'Please use one of:\n\n' +
                '`none` • `low` • `medium` • `high` • `urgent`',
              color: 0xED4245,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      await updateTicketPriority(
        interaction.channel,
        priority,
        interaction.user
      );

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Priority Updated',
            `Ticket priority set to **${priority.toUpperCase()}**.`
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Error submitting priority modal:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            `An error occurred while updating the priority: ${
              error?.message || 'Unknown error'
            }`,
        });
      } else {
        await interaction.editReply({
          embeds: [
            createEmbed({
              title: '❌ Priority Update Failed',
              description:
                error?.message ||
                'An error occurred while updating the priority.',
              color: 0xED4245,
            }),
          ],
        }).catch(() => {});
      }
    }
  },
};


/* ============================================================
   OLD DIRECT PRIORITY HANDLER
   ============================================================ */

const priorityTicketHandler = {
  name: 'ticket_priority',

  async execute(interaction, client, args) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'change ticket priority',
        {},
        2500
      );

      const priority = args?.[0];

      if (!priority) {
        await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message:
            'A priority value is required.',
        });

        return;
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      await updateTicketPriority(
        interaction.channel,
        priority,
        interaction.user
      );

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Priority Updated',
            `Ticket priority set to **${priority.toUpperCase()}**.`
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Error updating ticket priority:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'An error occurred while updating the priority.',
        });
      } else {
        await interaction.editReply({
          embeds: [
            createEmbed({
              title: '❌ Priority Update Failed',
              description:
                error?.message ||
                'An error occurred while updating the priority.',
              color: 0xED4245,
            }),
          ],
        }).catch(() => {});
      }
    }
  },
};


/* ============================================================
   CLAIM
   ============================================================ */

const claimTicketHandler = {
  name: 'ticket_claim',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'claim tickets',
        {},
        2500
      );

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      await claimTicket(
        interaction.channel,
        interaction.user
      );

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Ticket Claimed',
            'You have claimed this ticket.'
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Error claiming ticket:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'An error occurred while claiming the ticket.',
        });
      } else {
        await interaction.editReply({
          embeds: [
            createEmbed({
              title: '❌ Claim Failed',
              description:
                error?.message ||
                'An error occurred while claiming the ticket.',
              color: 0xED4245,
            }),
          ],
        }).catch(() => {});
      }
    }
  },
};


/* ============================================================
   PIN
   ============================================================ */

const pinTicketHandler = {
  name: 'ticket_pin',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'pin tickets',
        {},
        2500
      );

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const channel = interaction.channel;

      const hasPinEmoji =
        channel.name.startsWith('📌');

      if (hasPinEmoji) {
        const newName =
          channel.name.replace(/^📌\s*/, '');

        await channel.edit({
          name: newName,
          position: 999,
        });

        await interaction.editReply({
          embeds: [
            createEmbed({
              title: '📌 Ticket Unpinned',
              description:
                'This ticket has been unpinned and moved back to normal position.',
              color: 0x95A5A6,
            }),
          ],
        });
      } else {
        const pinnedName =
          `📌 ${channel.name}`;

        await channel.edit({
          name: pinnedName.slice(0, 100),
          position: 0,
        });

        await interaction.editReply({
          embeds: [
            createEmbed({
              title: '📌 Ticket Pinned',
              description:
                'This ticket has been pinned to the top of the category.',
              color: 0x3498DB,
            }),
          ],
        });
      }

      await logTicketEvent({
        client: interaction.client,
        guildId: interaction.guildId,
        event: {
          type: hasPinEmoji
            ? 'unpin'
            : 'pin',

          ticketId:
            interaction.channel.id,

          ticketNumber:
            interaction.channel.name.replace(
              /[^0-9]/g,
              ''
            ),

          userId:
            interaction.user.id,

          executorId:
            interaction.user.id,

          metadata: {
            isPinned: !hasPinEmoji,
            newChannelName:
              interaction.channel.name,
          },
        },
      });
    } catch (error) {
      logger.error(
        'Error pinning/unpinning ticket:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'Failed to pin/unpin the ticket.',
        });
      }
    }
  },
};


/* ============================================================
   UNCLAIM
   ============================================================ */

const unclaimTicketHandler = {
  name: 'ticket_unclaim',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'unclaim tickets',
        {},
        2500
      );

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const { unclaimTicket } =
        await import('../services/ticket.js');

      await unclaimTicket(
        interaction.channel,
        interaction.member
      );

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Ticket Unclaimed',
            'This ticket has been unclaimed.'
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Error unclaiming ticket:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'An error occurred while unclaiming the ticket.',
        });
      }
    }
  },
};


/* ============================================================
   REOPEN
   ============================================================ */

const reopenTicketHandler = {
  name: 'ticket_reopen',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'reopen tickets',
        {},
        2500
      );

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const {
        reopenTicket,
      } = await import('../services/ticket.js');

      const {
        movedToOpenCategory,
        openCategoryMoveFailed,
      } = await reopenTicket(
        interaction.channel,
        interaction.member
      );

      let message =
        'This ticket has been reopened.';

      if (openCategoryMoveFailed) {
        message +=
          ' Note: Could not move the channel back to the open tickets category.';
      }

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Ticket Reopened',
            message
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Error reopening ticket:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'An error occurred while reopening the ticket.',
        });
      }
    }
  },
};


/* ============================================================
   DELETE
   ============================================================ */

const deleteTicketHandler = {
  name: 'ticket_delete',

  async execute(interaction, client) {
    try {
      if (!(await ensureGuildContext(interaction))) return;

      await assertTicketPermission(
        interaction,
        client,
        'delete tickets',
        {},
        2500
      );

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const {
        deleteTicket,
      } = await import('../services/ticket.js');

      await deleteTicket(
        interaction.channel,
        interaction.member
      );

      await interaction.editReply({
        embeds: [
          successEmbed(
            'Ticket Deleted',
            'This ticket will be deleted shortly.'
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Error deleting ticket:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'An error occurred while deleting the ticket.',
        });
      }
    }
  },
};


/* ============================================================
   EXPORTS
   ============================================================ */

export default createTicketHandler;

export {
  createTicketModalHandler,
  closeTicketModalHandler,
  closeTicketHandler,

  claimTicketHandler,

  priorityMenuHandler,
  priorityModalHandler,
  priorityTicketHandler,

  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
};
