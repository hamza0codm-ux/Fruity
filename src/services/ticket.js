// ticket.js

import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';

import {
  buildStandardLogEmbed,
  formatLogLine,
} from '../utils/logging/logEmbeds.js';

import { getGuildConfig } from './config/guildConfig.js';

import {
  getTicketData,
  saveTicketData,
  getOpenTicketCountForUser,
  incrementTicketCounter,
} from '../utils/database.js';

import { logger } from '../utils/logger.js';

import {
  createEmbed,
} from '../utils/embeds.js';

import { logTicketEvent } from '../utils/ticket/ticketLogging.js';

import {
  createError,
  ErrorTypes,
} from '../utils/errorHandler.js';

import {
  ensureTypedServiceError,
  wrapServiceBoundary,
} from '../utils/serviceErrorBoundary.js';

import { PRIORITY_MAP } from '../utils/helpers.js';


const TICKET_DELETE_DELAY_MS = 3000;
const TICKET_DELETE_DELAY_SECONDS =
  Math.floor(TICKET_DELETE_DELAY_MS / 1000);

const TICKET_SERVICE = 'ticketService';


function ticketUserError(
  message,
  userMessage,
  type = ErrorTypes.VALIDATION,
  context = {}
) {
  throw createError(
    message,
    type,
    userMessage,
    {
      service: TICKET_SERVICE,
      ...context,
    }
  );
}


function requireTicket(ticketData, channel) {
  if (!ticketData) {
    ticketUserError(
      'Not a ticket channel',
      'This is not a ticket channel.',
      ErrorTypes.VALIDATION,
      {
        channelId: channel?.id,
        guildId: channel?.guild?.id,
      }
    );
  }

  return ticketData;
}


function rethrowTicketError(
  error,
  operation,
  userMessage,
  context = {}
) {
  throw ensureTypedServiceError(
    error,
    {
      service: TICKET_SERVICE,
      operation,
      message: `Ticket operation failed: ${operation}`,
      userMessage,
      context,
    }
  );
}


/* =========================================================
   TICKET CONTROL BUTTONS
========================================================= */

function buildTicketControlRow({
  claimedBy = null,
} = {}) {
  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(
        claimedBy
          ? 'Claimed'
          : 'Claim'
      )
      .setStyle(
        claimedBy
          ? ButtonStyle.Secondary
          : ButtonStyle.Primary
      )
      .setEmoji('🙋')
      .setDisabled(!!claimedBy),

    new ButtonBuilder()
      .setCustomId('ticket_pin')
      .setLabel('Pin')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📌'),

    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),

  );
}


/* =========================================================
   USER TICKET COUNT
========================================================= */

export const getUserTicketCount =
  wrapServiceBoundary(
    async function getUserTicketCount(
      guildId,
      userId
    ) {
      return await getOpenTicketCountForUser(
        guildId,
        userId
      );
    },
    {
      service: TICKET_SERVICE,
      operation: 'getUserTicketCount',
      userMessage: 'Failed to count open tickets.',
      context: {},
    }
  );


/* =========================================================
   CREATE TICKET
========================================================= */

export async function createTicket(
  guild,
  member,
  categoryId,
  reason = 'No reason provided',
  priority = 'none'
) {
  try {

    const config =
      await getGuildConfig(
        guild.client,
        guild.id
      );

    const ticketConfig =
      config.tickets || {};

    const maxTicketsPerUser =
      config.maxTicketsPerUser ?? 3;

    const currentTicketCount =
      await getUserTicketCount(
        guild.id,
        member.id
      );

    if (
      currentTicketCount >=
      maxTicketsPerUser
    ) {
      ticketUserError(
        `Max open tickets reached for ${member.id}`,
        `You have reached the maximum number of open tickets (${maxTicketsPerUser}). Please close your existing tickets before creating a new one.`,
        ErrorTypes.VALIDATION,
        {
          guildId: guild.id,
          userId: member.id,
          operation: 'createTicket',
        }
      );
    }

    let category = categoryId
      ? guild.channels.cache.get(categoryId)
      : guild.channels.cache.find(
          c =>
            c.type === ChannelType.GuildCategory &&
            c.name
              .toLowerCase()
              .includes('tickets')
        );

    if (!category && !categoryId) {
      category =
        await guild.channels.create({
          name: 'Tickets',
          type: ChannelType.GuildCategory,

          permissionOverwrites: [
            {
              id: guild.id,
              deny: [
                PermissionFlagsBits.ViewChannel,
              ],
            },
          ],
        });
    }

    const ticketNumber =
      await getNextTicketNumber(
        guild.id
      );

    let channelName =
      `ticket-${ticketNumber}`;

    if (priority !== 'none') {
      const priorityInfo =
        PRIORITY_MAP[priority];

      if (priorityInfo) {
        channelName =
          `${priorityInfo.emoji} ${channelName}`;
      }
    }

    const channel =
      await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category?.id,

        permissionOverwrites: [
          {
            id: guild.id,
            deny: [
              PermissionFlagsBits.ViewChannel,
            ],
          },

          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },

          ...(config.ticketStaffRoleId
            ? [
                {
                  id: config.ticketStaffRoleId,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                  ],
                },
              ]
            : []),
        ],
      });

    const ticketData = {
      id: channel.id,
      userId: member.id,
      guildId: guild.id,
      createdAt:
        new Date().toISOString(),
      status: 'open',
      claimedBy: null,
      priority: priority || 'none',
      reason,
    };

    await saveTicketData(
      guild.id,
      channel.id,
      ticketData
    );

    const priorityInfo =
      PRIORITY_MAP[priority] ||
      PRIORITY_MAP.none;

    const embed =
      createEmbed({
        title:
          `Ticket #${ticketNumber}`,

        description:
          `${member.toString()}, thanks for creating a ticket!\n\n` +
          `**Reason:** ${reason}\n` +
          `**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,

        color:
          priorityInfo.color,

        fields: [
          {
            name: 'Status',
            value: '🟢 Open',
            inline: true,
          },

          {
            name: 'Claimed By',
            value: 'Not claimed',
            inline: true,
          },

          {
            name: 'Created',
            value:
              `<t:${Math.floor(Date.now() / 1000)}:R>`,
            inline: true,
          },
        ],
      });

    const row =
      buildTicketControlRow();

    if (
      ticketConfig.enablePriority
    ) {
      row.addComponents(

        new ButtonBuilder()
          .setCustomId(
            'ticket_priority:low'
          )
          .setLabel('Low')
          .setStyle(
            ButtonStyle.Secondary
          )
          .setEmoji('🔵'),

        new ButtonBuilder()
          .setCustomId(
            'ticket_priority:high'
          )
          .setLabel('High')
          .setStyle(
            ButtonStyle.Danger
          )
          .setEmoji('🔴'),

      );
    }

    const staffMention =
      config.ticketStaffRoleId
        ? ` <@&${config.ticketStaffRoleId}>`
        : '';

    const messageContent =
      `${member.toString()}${staffMention}`;

    const ticketMessage =
      await channel.send({
        content: messageContent,
        embeds: [embed],
        components: [row],
      });

    await ticketMessage
      .pin()
      .catch(() => {});

    await logTicketEvent({
      client: guild.client,
      guildId: guild.id,

      event: {
        type: 'open',
        ticketId: channel.id,
        ticketNumber,
        userId: member.id,
        executorId: member.id,
        reason,
        priority:
          priority || 'none',

        metadata: {
          channelId: channel.id,
          categoryName:
            category?.name ||
            'Default',
        },
      },
    });

    return {
      channel,
      ticketData,
    };

  } catch (error) {

    rethrowTicketError(
      error,
      'createTicket',
      'Failed to create ticket. Please try again in a moment.',
      {
        guildId: guild?.id,
        userId: member?.id,
      }
    );
  }
}


/* =========================================================
   CLOSE TICKET
========================================================= */

export async function closeTicket(
  channel,
  closer,
  reason = 'No reason provided'
) {
  try {

    const ticketData =
      requireTicket(
        await getTicketData(
          channel.guild.id,
          channel.id
        ),
        channel
      );

    const config =
      await getGuildConfig(
        channel.client,
        channel.guild.id
      );

    const dmOnClose =
      config.dmOnClose !== false;

    const closedCategoryId =
      config.ticketClosedCategoryId ||
      null;

    let movedToClosedCategory =
      false;

    ticketData.status = 'closed';
    ticketData.closedBy =
      closer.id;

    ticketData.closedAt =
      new Date().toISOString();

    ticketData.closeReason =
      reason;

    await saveTicketData(
      channel.guild.id,
      channel.id,
      ticketData
    );

    /* Move to closed category */

    if (
      closedCategoryId &&
      channel.parentId !==
        closedCategoryId
    ) {

      const closedCategory =
        channel.guild.channels.cache.get(
          closedCategoryId
        ) ||
        await channel.guild.channels
          .fetch(closedCategoryId)
          .catch(() => null);

      if (
        closedCategory?.type ===
        ChannelType.GuildCategory
      ) {

        try {

          await channel.setParent(
            closedCategoryId,
            {
              lockPermissions: false,
            }
          );

          movedToClosedCategory =
            true;

        } catch (moveError) {

          logger.warn(
            `Could not move ticket ${channel.id} to closed category ${closedCategoryId}: ${moveError.message}`
          );
        }

      } else {

        logger.warn(
          `Configured closed category is invalid for guild ${channel.guild.id}: ${closedCategoryId}`
        );
      }
    }

    /* DM creator */

    if (dmOnClose) {

      try {

        const ticketCreator =
          await channel.client.users
            .fetch(ticketData.userId)
            .catch(() => null);

        if (ticketCreator) {

          const dmEmbed =
            createEmbed({
              title:
                '🎫 Your Ticket Has Been Closed',

              description:
                `Your ticket **${channel.name}** has been closed.\n\n` +
                `**Reason:** ${reason}\n` +
                `**Closed by:** ${closer.tag}\n` +
                `**Closed at:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
                `Thank you for using our support system! If you have any further questions, feel free to create a new ticket.`,

              color: '#e74c3c',

              footer: {
                text:
                  `Ticket ID: ${ticketData.id}`,
              },
            });

          await ticketCreator.send({
            embeds: [dmEmbed],
          });

          try {

            const feedbackEmbed =
              createEmbed({
                title:
                  '⭐ How was your support experience?',

                description:
                  `We'd love to know how we did with **${channel.name}**.\nSelect a rating below — it only takes a second!`,

                color: '#F1C40F',

                footer: {
                  text:
                    'Your feedback helps us improve.',
                },
              });

            const base =
              `ticket_feedback:${channel.guild.id}:${channel.id}`;

            const starsRow =
              new ActionRowBuilder()
                .addComponents(

                  new ButtonBuilder()
                    .setCustomId(`${base}:1`)
                    .setLabel('⭐ 1')
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(`${base}:2`)
                    .setLabel('⭐ 2')
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(`${base}:3`)
                    .setLabel('⭐ 3')
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(`${base}:4`)
                    .setLabel('⭐ 4')
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(`${base}:5`)
                    .setLabel('⭐ 5')
                    .setStyle(
                      ButtonStyle.Primary
                    ),

                );

            const declineRow =
              new ActionRowBuilder()
                .addComponents(

                  new ButtonBuilder()
                    .setCustomId(
                      `ticket_feedback_comment:${channel.guild.id}:${channel.id}`
                    )
                    .setLabel(
                      '✍️ Add Comment'
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      `ticket_feedback_decline:${channel.guild.id}:${channel.id}`
                    )
                    .setLabel(
                      '❌ No thanks'
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                );

            await ticketCreator.send({
              embeds: [feedbackEmbed],
              components: [
                starsRow,
                declineRow,
              ],
            });

          } catch (feedbackError) {

            logger.warn(
              `Could not send feedback survey to ticket creator ${ticketData.userId}: ${feedbackError.message}`
            );
          }
        }

      } catch (dmError) {

        logger.warn(
          `Could not send DM to ticket creator ${ticketData.userId}: ${dmError.message}`
        );
      }
    }

    /* Remove user's ticket access */

    try {

      const user =
        await channel.guild.members
          .fetch(ticketData.userId)
          .catch(() => null);

      const targetUser =
        user?.user ||
        await channel.client.users
          .fetch(ticketData.userId)
          .catch(() => null);

      if (targetUser) {

        const overwrite =
          channel.permissionOverwrites.cache.get(
            ticketData.userId
          );

        if (overwrite) {

          await overwrite.edit({
            ViewChannel: false,
            SendMessages: false,
          });

        } else {

          await channel.permissionOverwrites.create(
            targetUser,
            {
              ViewChannel: false,
              SendMessages: false,
            }
          );
        }
      }

    } catch (permError) {

      logger.warn(
        `Could not update user permissions for closed ticket: ${permError.message}`
      );
    }

    /* Update main ticket embed */

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          m.embeds[0].title
            ?.startsWith('Ticket #')
      );

    if (ticketMessage) {

      const embed =
        ticketMessage.embeds[0];

      const statusField =
        embed.fields?.find(
          f => f.name === 'Status'
        );

      if (statusField) {
        statusField.value =
          '🔴 Closed';
      }

      const updatedEmbed =
        createEmbed({
          title:
            embed.title ||
            'Ticket',

          description:
            embed.description ||
            'Ticket discussion',

          color:
            '#e74c3c',

          fields:
            embed.fields || [],

          footer:
            embed.footer,
        });

      await ticketMessage.edit({
        embeds: [updatedEmbed],
        components: [],
      });
    }

    /* Closed message */

    const closeEmbed =
      createEmbed({
        title:
          'Ticket Closed',

        description:
          `This ticket has been closed by ${closer}.\n` +
          `**Reason:** ${reason}` +
          (
            dmOnClose
              ? '\n\n📩 A DM has been sent to the ticket creator.'
              : ''
          ),

        color:
          '#e74c3c',

        footer: {
          text:
            `Ticket ID: ${ticketData.id}`,
        },
      });

    const controlRow =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              'ticket_reopen'
            )
            .setLabel(
              'Reopen Ticket'
            )
            .setStyle(
              ButtonStyle.Success
            )
            .setEmoji('🔓'),

          new ButtonBuilder()
            .setCustomId(
              'ticket_delete'
            )
            .setLabel(
              'Delete Ticket'
            )
            .setStyle(
              ButtonStyle.Danger
            )
            .setEmoji('🗑️'),

        );

    await channel.send({
      embeds: [closeEmbed],
      components: [controlRow],
    });

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,

      event: {
        type: 'close',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: closer.id,
        reason,

        metadata: {
          dmSent: dmOnClose,
          closedAt:
            ticketData.closedAt,
          movedToClosedCategory,
        },
      },
    });

    return ticketData;

  } catch (error) {

    rethrowTicketError(
      error,
      'closeTicket',
      'Failed to close ticket. Please try again in a moment.',
      {
        guildId:
          channel?.guild?.id,

        channelId:
          channel?.id,

        closerId:
          closer?.id,
      }
    );
  }
}


/* =========================================================
   CLAIM TICKET
========================================================= */

export async function claimTicket(
  channel,
  claimer
) {
  try {

    const ticketData =
      requireTicket(
        await getTicketData(
          channel.guild.id,
          channel.id
        ),
        channel
      );

    if (ticketData.claimedBy) {

      ticketUserError(
        'Ticket already claimed',
        `This ticket is already claimed by <@${ticketData.claimedBy}>`,
        ErrorTypes.VALIDATION,
        {
          channelId: channel.id,
          claimedBy:
            ticketData.claimedBy,
          operation:
            'claimTicket',
        }
      );
    }

    ticketData.claimedBy =
      claimer.id;

    ticketData.claimedAt =
      new Date().toISOString();

    await saveTicketData(
      channel.guild.id,
      channel.id,
      ticketData
    );

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          m.embeds[0].title
            ?.startsWith('Ticket #')
      );

    if (ticketMessage) {

      const embed =
        ticketMessage.embeds[0];

      const claimedField =
        embed.fields?.find(
          f => f.name === 'Claimed By'
        );

      if (claimedField) {
        claimedField.value =
          claimer.toString();
      }

      const row =
        buildTicketControlRow({
          claimedBy:
            claimer.id,
        });

      await ticketMessage.edit({
        embeds: [embed],
        components: [row],
      });
    }

    const claimEmbed =
      createEmbed({
        title:
          'Ticket Claimed',

        description:
          `🎉 ${claimer} has claimed this ticket!`,

        color:
          '#2ecc71',
      });

    const unclaimRow =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              'ticket_unclaim'
            )
            .setLabel(
              'Unclaim'
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setEmoji('🔓'),

        );

    const claimStatusMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          (
            m.embeds[0].title ===
              'Ticket Claimed' ||
            m.embeds[0].title ===
              'Ticket Unclaimed'
          )
      );

    if (claimStatusMessage) {

      await claimStatusMessage.edit({
        embeds: [claimEmbed],
        components: [unclaimRow],
      });

    } else {

      await channel.send({
        embeds: [claimEmbed],
        components: [unclaimRow],
      });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,

      event: {
        type: 'claim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: claimer.id,

        metadata: {
          claimedAt:
            ticketData.claimedAt,
        },
      },
    });

    return ticketData;

  } catch (error) {

    rethrowTicketError(
      error,
      'claimTicket',
      'Failed to claim ticket. Please try again in a moment.',
      {
        guildId:
          channel?.guild?.id,

        channelId:
          channel?.id,

        claimerId:
          claimer?.id,
      }
    );
  }
}


/* =========================================================
   REOPEN TICKET
========================================================= */

export async function reopenTicket(
  channel,
  reopener
) {
  try {

    const ticketData =
      requireTicket(
        await getTicketData(
          channel.guild.id,
          channel.id
        ),
        channel
      );

    if (
      ticketData.status !==
      'closed'
    ) {
      ticketUserError(
        'Ticket not closed',
        'This ticket is not currently closed.',
        ErrorTypes.VALIDATION,
        {
          channelId:
            channel.id,

          operation:
            'reopenTicket',
        }
      );
    }

    const config =
      await getGuildConfig(
        channel.client,
        channel.guild.id
      );

    const openCategoryId =
      config.ticketCategoryId ||
      null;

    let movedToOpenCategory =
      false;

    let openCategoryMoveFailed =
      false;

    ticketData.status =
      'open';

    ticketData.closedBy =
      null;

    ticketData.closedAt =
      null;

    ticketData.closeReason =
      null;

    await saveTicketData(
      channel.guild.id,
      channel.id,
      ticketData
    );

    if (
      openCategoryId &&
      channel.parentId !==
        openCategoryId
    ) {

      const openCategory =
        channel.guild.channels.cache.get(
          openCategoryId
        ) ||
        await channel.guild.channels
          .fetch(openCategoryId)
          .catch(() => null);

      if (
        openCategory?.type ===
        ChannelType.GuildCategory
      ) {

        try {

          await channel.setParent(
            openCategoryId,
            {
              lockPermissions: false,
            }
          );

          movedToOpenCategory =
            true;

        } catch (moveError) {

          openCategoryMoveFailed =
            true;

          logger.warn(
            `Could not move reopened ticket ${channel.id} to open category ${openCategoryId}: ${moveError.message}`
          );
        }

      } else {

        openCategoryMoveFailed =
          true;

        logger.warn(
          `Configured open ticket category is invalid for guild ${channel.guild.id}: ${openCategoryId}`
        );
      }
    }

    /* Restore user access */

    try {

      const user =
        await channel.guild.members
          .fetch(ticketData.userId)
          .catch(() => null);

      if (user) {

        await channel.permissionOverwrites
          .create(
            user,
            {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              AttachFiles: true,
            }
          );
      }

    } catch (error) {

      logger.warn(
        `Could not restore access for user ${ticketData.userId}:`,
        error.message
      );
    }

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          m.embeds[0].title
            ?.startsWith('Ticket #')
      );

    if (ticketMessage) {

      const embed =
        ticketMessage.embeds[0];

      const statusField =
        embed.fields?.find(
          f => f.name === 'Status'
        );

      if (statusField) {
        statusField.value =
          '🟢 Open';
      }

      const row =
        buildTicketControlRow({
          claimedBy:
            ticketData.claimedBy,
        });

      await ticketMessage.edit({
        embeds: [embed],
        components: [row],
      });
    }

    const reopenEmbed =
      createEmbed({
        title:
          'Ticket Reopened',

        description:
          `🔓 ${reopener} has reopened this ticket!`,

        color:
          '#2ecc71',
      });

    const closeStatusMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          m.embeds[0].title ===
            'Ticket Closed' &&
          m.components.length > 0 &&
          m.components[0].components.some(
            c =>
              c.customId ===
              'ticket_reopen'
          )
      );

    if (closeStatusMessage) {

      await closeStatusMessage.edit({
        embeds: [reopenEmbed],
        components: [],
      });

    } else {

      await channel.send({
        embeds: [reopenEmbed],
      });
    }

    return {
      ticketData,
      movedToOpenCategory,
      openCategoryMoveFailed,
    };

  } catch (error) {

    rethrowTicketError(
      error,
      'reopenTicket',
      'Failed to reopen ticket. Please try again in a moment.',
      {
        guildId:
          channel?.guild?.id,

        channelId:
          channel?.id,

        reopenerId:
          reopener?.id,
      }
    );
  }
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(text) {
  if (!text) {
    return '';
  }

  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* =========================================================
   GENERATE TRANSCRIPT
========================================================= */

async function generateTranscript(channel) {

  try {

    logger.info(
      'Starting transcript generation',
      {
        channelId:
          channel.id,

        channelName:
          channel.name,
      }
    );

    const messages = [];

    let before;

    while (true) {

      const options = {
        limit: 100,
      };

      if (before) {
        options.before =
          before;
      }

      const batch =
        await channel.messages.fetch(
          options
        );

      if (
        !batch ||
        batch.size === 0
      ) {
        break;
      }

      messages.push(
        ...batch.values()
      );

      const oldestMessage =
        batch.last();

      if (!oldestMessage) {
        break;
      }

      before =
        oldestMessage.id;

      if (batch.size < 100) {
        break;
      }
    }

    messages.sort(
      (a, b) =>
        a.createdTimestamp -
        b.createdTimestamp
    );

    const rows =
      messages
        .map(message => {

          const timestamp =
            new Date(
              message.createdTimestamp
            )
              .toISOString()
              .replace('T', ' ')
              .slice(0, 19);

          const author =
            escapeHtml(
              message.author?.tag ||
              message.author?.username ||
              'Unknown User'
            );

          let content =
            message.content || '';

          if (
            !content &&
            message.embeds?.length
          ) {
            content =
              '[Embed]';
          }

          if (
            !content &&
            message.attachments?.size
          ) {
            content =
              `[Attachment: ${message.attachments.size}]`;
          }

          if (!content) {
            content =
              '[No text content]';
          }

          return `
<tr>
<td class="timestamp">${escapeHtml(timestamp)}</td>
<td class="author">${author}</td>
<td class="message">${escapeHtml(content).replace(/\n/g, '<br>')}</td>
</tr>`;
        })
        .join('\n');

    const html =
`<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
Ticket Transcript - ${escapeHtml(channel.name)}
</title>

<style>

body {
  margin: 0;
  padding: 30px;
  background: #36393f;
  color: #dcddde;
  font-family:
    Arial,
    Helvetica,
    sans-serif;
}

.container {
  max-width: 1200px;
  margin: auto;
}

h1 {
  color: #ffffff;
  margin-bottom: 5px;
}

.info {
  color: #72767d;
  margin-bottom: 25px;
  line-height: 1.7;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #2f3136;
}

th {
  background: #202225;
  color: #b9bbbe;
  padding: 12px;
  text-align: left;
}

td {
  padding: 10px 12px;
  border-bottom:
    1px solid #40444b;
  vertical-align: top;
}

.timestamp {
  color: #72767d;
  white-space: nowrap;
  width: 170px;
}

.author {
  color: #7289da;
  font-weight: bold;
  white-space: nowrap;
  width: 180px;
}

.message {
  color: #dcddde;
  word-break: break-word;
}

.footer {
  margin-top: 25px;
  color: #72767d;
  font-size: 12px;
}

</style>

</head>

<body>

<div class="container">

<h1>
📜 Ticket Transcript
</h1>

<div class="info">

<strong>Channel:</strong>
${escapeHtml(channel.name)}
<br>

<strong>Messages:</strong>
${messages.length}
<br>

<strong>Generated:</strong>
${escapeHtml(new Date().toUTCString())}

</div>

<table>

<thead>

<tr>
<th>Timestamp (UTC)</th>
<th>Author</th>
<th>Message</th>
</tr>

</thead>

<tbody>

${rows}

</tbody>

</table>

<div class="footer">
Transcript generated by the ticket system.
</div>

</div>

</body>

</html>`;

    const buffer =
      Buffer.from(
        html,
        'utf8'
      );

    const safeChannelName =
      channel.name
        .replace(
          /[^a-zA-Z0-9-_]/g,
          '_'
        );

    const filename =
      `transcript-${safeChannelName}.html`;

    logger.info(
      'Transcript generated successfully',
      {
        channelId:
          channel.id,

        channelName:
          channel.name,

        messageCount:
          messages.length,

        size:
          buffer.length,

        filename,
      }
    );

    return {
      buffer,
      filename,
    };

  } catch (error) {

    logger.error(
      'Transcript generation failed',
      {
        channelId:
          channel?.id,

        channelName:
          channel?.name,

        error:
          error.message,

        stack:
          error.stack,
      }
    );

    return null;
  }
}


/* =========================================================
   DELETE TICKET
========================================================= */

export async function deleteTicket(
  channel,
  deleter
) {

  try {

    const ticketData =
      requireTicket(
        await getTicketData(
          channel.guild.id,
          channel.id
        ),
        channel
      );

    const deleteEmbed =
      createEmbed({
        title:
          'Ticket Deleted',

        description:
          `🗑️ This ticket will be permanently deleted in ${TICKET_DELETE_DELAY_SECONDS} seconds.`,

        color:
          '#e74c3c',

        footer: {
          text:
            `Ticket ID: ${ticketData.id}`,
        },
      });

    await channel.send({
      embeds: [deleteEmbed],
    });

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,

      event: {
        type: 'delete',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: deleter.id,

        metadata: {
          deletedAt:
            new Date().toISOString(),
        },
      },
    });

    /*
     * Wait before deleting.
     *
     * The transcript is generated and sent
     * INSIDE this timeout, immediately before
     * the channel is deleted.
     */

    setTimeout(
      async () => {

        try {

          logger.info(
            'Starting ticket deletion process',
            {
              channelId:
                channel.id,

              ticketId:
                ticketData.id,

              channelName:
                channel.name,
            }
          );


          /* =================================================
             GENERATE TRANSCRIPT
          ================================================= */

          let transcript = null;

          try {

            transcript =
              await generateTranscript(
                channel
              );

            if (!transcript) {

              logger.error(
                'Transcript was not generated',
                {
                  channelId:
                    channel.id,

                  ticketNumber:
                    ticketData.id,
                }
              );

            } else {

              logger.info(
                'Transcript ready to send',
                {
                  channelId:
                    channel.id,

                  ticketNumber:
                    ticketData.id,

                  filename:
                    transcript.filename,

                  size:
                    transcript.buffer.length,
                }
              );
            }

          } catch (transcriptError) {

            logger.error(
              'Transcript generation threw an error',
              {
                channelId:
                  channel.id,

                ticketNumber:
                  ticketData.id,

                error:
                  transcriptError.message,

                stack:
                  transcriptError.stack,
              }
            );
          }


          /* =================================================
             SEND TRANSCRIPT
          ================================================= */

          if (transcript) {

            try {

              const guildConfig =
                await getGuildConfig(
                  channel.client,
                  channel.guild.id
                );

              const transcriptChannelId =
                guildConfig?.ticketTranscriptChannelId;


              /* ---------------------------------------------
                 CHECK CONFIGURATION
              --------------------------------------------- */

              if (!transcriptChannelId) {

                logger.error(
                  'NO TRANSCRIPT CHANNEL CONFIGURED',
                  {
                    guildId:
                      channel.guild.id,

                    ticketNumber:
                      ticketData.id,

                    channelId:
                      channel.id,

                    availableConfigKeys:
                      Object.keys(
                        guildConfig || {}
                      ),
                  }
                );

              } else {

                logger.info(
                  'Fetching transcript channel',
                  {
                    guildId:
                      channel.guild.id,

                    transcriptChannelId,
                  }
                );


                /* -------------------------------------------
                   FETCH TRANSCRIPT CHANNEL
                ------------------------------------------- */

                const transcriptChannel =
                  await channel.client.channels
                    .fetch(
                      transcriptChannelId
                    )
                    .catch(error => {

                      logger.error(
                        'Failed to fetch transcript channel',
                        {
                          transcriptChannelId,

                          error:
                            error.message,

                          code:
                            error.code,
                        }
                      );

                      return null;
                    });


                if (!transcriptChannel) {

                  logger.error(
                    'Transcript channel does not exist or cannot be fetched',
                    {
                      transcriptChannelId,
                    }
                  );

                } else if (
                  !transcriptChannel.isTextBased()
                ) {

                  logger.error(
                    'Transcript channel is not a text channel',
                    {
                      transcriptChannelId,

                      channelType:
                        transcriptChannel.type,
                    }
                  );

                } else if (
                  !transcriptChannel.isSendable()
                ) {

                  logger.error(
                    'Bot cannot send messages to transcript channel',
                    {
                      transcriptChannelId,
                    }
                  );

                } else {


                  /* -----------------------------------------
                     TRANSCRIPT LOG EMBED
                  ----------------------------------------- */

                  const transcriptEmbed =
                    buildStandardLogEmbed({
                      color:
                        0x3498db,

                      title:
                        '📜 Ticket Transcript',

                      description: [
                        formatLogLine(
                          'Ticket',
                          channel.name
                        ),

                        formatLogLine(
                          'User',
                          `<@${ticketData.userId}>`
                        ),

                        formatLogLine(
                          'Channel',
                          channel.name
                        ),

                        formatLogLine(
                          'Generated',
                          `<t:${Math.floor(Date.now() / 1000)}:F>`
                        ),

                        formatLogLine(
                          'Deleted By',
                          deleter?.toString?.() ||
                            'Unknown'
                        ),

                      ].join('\n'),

                      footer:
                        deleter?.username
                          ? {
                              text:
                                `Deleted by ${deleter.username}`,

                              iconURL:
                                deleter.displayAvatarURL?.(),
                            }
                          : undefined,

                      timestamp:
                        true,
                    });


                  logger.info(
                    'Sending transcript to transcript channel',
                    {
                      transcriptChannelId,

                      ticketNumber:
                        ticketData.id,

                      ticketChannelId:
                        channel.id,

                      filename:
                        transcript.filename,

                      size:
                        transcript.buffer.length,
                    }
                  );


                  /* -----------------------------------------
                     SEND HTML FILE
                  ----------------------------------------- */

                  await transcriptChannel.send({
                    embeds: [
                      transcriptEmbed,
                    ],

                    files: [
                      {
                        attachment:
                          transcript.buffer,

                        name:
                          transcript.filename,
                      },
                    ],
                  });


                  logger.info(
                    '✅ TRANSCRIPT SENT SUCCESSFULLY',
                    {
                      guildId:
                        channel.guild.id,

                      ticketNumber:
                        ticketData.id,

                      ticketChannelId:
                        channel.id,

                      transcriptChannelId,
                    }
                  );
                }
              }

            } catch (sendError) {

              logger.error(
                '❌ FAILED TO SEND TRANSCRIPT',
                {
                  guildId:
                    channel.guild.id,

                  ticketNumber:
                    ticketData.id,

                  ticketChannelId:
                    channel.id,

                  error:
                    sendError.message,

                  code:
                    sendError.code,

                  name:
                    sendError.name,

                  stack:
                    sendError.stack,
                }
              );
            }
          }


          /* =================================================
             DELETE CHANNEL
          ================================================= */

          try {

            await channel.delete(
              'Ticket deleted permanently'
            );

            logger.info(
              '✅ Channel deleted',
              {
                channelId:
                  channel.id,

                channelName:
                  channel.name,

                ticketNumber:
                  ticketData.id,
              }
            );

          } catch (deleteError) {

            logger.error(
              '❌ Failed to delete ticket channel',
              {
                channelId:
                  channel.id,

                channelName:
                  channel.name,

                ticketNumber:
                  ticketData.id,

                errorMessage:
                  deleteError.message,

                errorCode:
                  deleteError.code,

                errorName:
                  deleteError.name,
              }
            );
          }

        } catch (error) {

          logger.error(
            '❌ Unexpected error during ticket deletion',
            {
              channelId:
                channel.id,

              channelName:
                channel?.name,

              ticketNumber:
                ticketData?.id,

              errorMessage:
                error.message,

              errorName:
                error.name,

              errorStack:
                error.stack,
            }
          );
        }

      },
      TICKET_DELETE_DELAY_MS
    );

    return ticketData;

  } catch (error) {

    rethrowTicketError(
      error,
      'deleteTicket',
      'Failed to delete ticket. Please try again in a moment.',
      {
        guildId:
          channel?.guild?.id,

        channelId:
          channel?.id,

        deleterId:
          deleter?.id,
      }
    );
  }
}


/* =========================================================
   UNCLAIM TICKET
========================================================= */

export async function unclaimTicket(
  channel,
  unclaimer
) {

  try {

    const ticketData =
      requireTicket(
        await getTicketData(
          channel.guild.id,
          channel.id
        ),
        channel
      );

    if (!ticketData.claimedBy) {

      ticketUserError(
        'Ticket not claimed',
        'This ticket is not currently claimed.',
        ErrorTypes.VALIDATION,
        {
          channelId:
            channel.id,

          operation:
            'unclaimTicket',
        }
      );
    }

    if (
      ticketData.claimedBy !==
        unclaimer.id &&
      !unclaimer.permissions.has(
        PermissionFlagsBits.ManageChannels
      )
    ) {

      ticketUserError(
        'Cannot unclaim ticket',
        'You can only unclaim your own tickets or need Manage Channels permission.',
        ErrorTypes.PERMISSION,
        {
          channelId:
            channel.id,

          operation:
            'unclaimTicket',
        }
      );
    }

    const previousClaimer =
      ticketData.claimedBy;

    ticketData.claimedBy =
      null;

    ticketData.claimedAt =
      null;

    await saveTicketData(
      channel.guild.id,
      channel.id,
      ticketData
    );

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          m.embeds[0].title
            ?.startsWith('Ticket #')
      );

    if (ticketMessage) {

      const embed =
        ticketMessage.embeds[0];

      const claimedField =
        embed.fields?.find(
          f => f.name === 'Claimed By'
        );

      if (claimedField) {
        claimedField.value =
          'Not claimed';
      }

      const row =
        buildTicketControlRow();

      await ticketMessage.edit({
        embeds: [embed],
        components: [row],
      });
    }

    const claimMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          (
            m.embeds[0].title ===
              'Ticket Claimed' ||
            m.embeds[0].title ===
              'Ticket Unclaimed'
          )
      );

    const unclaimEmbed =
      createEmbed({
        title:
          'Ticket Unclaimed',

        description:
          `🔓 ${unclaimer} has unclaimed this ticket!`,

        color:
          '#f39c12',
      });

    if (claimMessage) {

      await claimMessage.edit({
        embeds: [unclaimEmbed],
        components: [],
      });

    } else {

      await channel.send({
        embeds: [unclaimEmbed],
      });
    }

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,

      event: {
        type: 'unclaim',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: unclaimer.id,

        metadata: {
          previousClaimer,
        },
      },
    });

    return ticketData;

  } catch (error) {

    rethrowTicketError(
      error,
      'unclaimTicket',
      'Failed to unclaim ticket. Please try again in a moment.',
      {
        guildId:
          channel?.guild?.id,

        channelId:
          channel?.id,

        unclaimerId:
          unclaimer?.id,
      }
    );
  }
}


/* =========================================================
   TICKET NUMBER
========================================================= */

async function getNextTicketNumber(
  guildId
) {
  return await incrementTicketCounter(
    guildId
  );
}


/* =========================================================
   UPDATE PRIORITY
========================================================= */

export async function updateTicketPriority(
  channel,
  priority,
  updater
) {

  try {

    const ticketData =
      requireTicket(
        await getTicketData(
          channel.guild.id,
          channel.id
        ),
        channel
      );

    const priorityInfo =
      PRIORITY_MAP[priority];

    if (!priorityInfo) {

      ticketUserError(
        'Invalid priority level',
        'Invalid priority level.',
        ErrorTypes.VALIDATION,
        {
          channelId:
            channel.id,

          priority,

          operation:
            'updateTicketPriority',
        }
      );
    }

    const previousPriority =
      ticketData.priority || 'none';

    ticketData.priority =
      priority;

    ticketData.priorityUpdatedBy =
      updater.id;

    ticketData.priorityUpdatedAt =
      new Date().toISOString();

    await saveTicketData(
      channel.guild.id,
      channel.id,
      ticketData
    );

    const currentName =
      channel.name;

    const priorityEmojis =
      [
        ...new Set(
          Object.values(
            PRIORITY_MAP
          )
            .map(
              item => item.emoji
            )
            .filter(Boolean)
        ),
      ];

    const escapedPriorityEmojis =
      priorityEmojis.map(
        emoji =>
          emoji.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          )
      );

    const cleanName =
      escapedPriorityEmojis.length > 0
        ? currentName.replace(
            new RegExp(
              `(?:${escapedPriorityEmojis.join('|')})`,
              'g'
            ),
            ''
          ).trim()
        : currentName.trim();

    const newName =
      priority === 'none'
        ? cleanName
        : `${priorityInfo.emoji} ${cleanName}`;

    if (
      newName &&
      newName !== currentName
    ) {

      try {

        await channel.setName(
          newName
        );

      } catch (nameError) {

        logger.warn(
          `Could not update channel name for priority: ${nameError.message}`
        );
      }
    }

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      messages.find(
        m =>
          m.embeds.length > 0 &&
          m.embeds[0].title
            ?.startsWith('Ticket #')
      );

    if (ticketMessage) {

      const embed =
        ticketMessage.embeds[0];

      const descriptionBase =
        embed.description
          ?.split(
            '\n**Priority:**'
          )[0] ||
        '';

      const updatedEmbed =
        createEmbed({
          title:
            embed.title ||
            'Ticket',

          description:
            descriptionBase +
            `\n**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,

          color:
            priorityInfo.color,

          fields:
            embed.fields || [],

          footer:
            embed.footer,
        });

      await ticketMessage.edit({
        embeds: [updatedEmbed],
      });
    }

    const updateEmbed =
      createEmbed({
        title:
          'Priority Updated',

        description:
          `📊 Ticket priority updated to **${priorityInfo.emoji} ${priorityInfo.label}** by ${updater}`,

        color:
          priorityInfo.color,
      });

    await channel.send({
      embeds: [updateEmbed],
    });

    await logTicketEvent({
      client: channel.client,
      guildId: channel.guild.id,

      event: {
        type: 'priority',
        ticketId: channel.id,
        ticketNumber: ticketData.id,
        userId: ticketData.userId,
        executorId: updater.id,
        priority,

        metadata: {
          previousPriority,
          updatedAt:
            ticketData.priorityUpdatedAt,
        },
      },
    });

    return ticketData;

  } catch (error) {

    rethrowTicketError(
      error,
      'updateTicketPriority',
      'Failed to update ticket priority. Please try again in a moment.',
      {
        guildId:
          channel?.guild?.id,

        channelId:
          channel?.id,

        updaterId:
          updater?.id,

        priority,
      }
    );
  }
}
