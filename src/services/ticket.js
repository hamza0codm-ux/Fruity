// ticket.js

import {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { buildStandardLogEmbed, formatLogLine } from '../utils/logging/logEmbeds.js';
import { getGuildConfig } from './config/guildConfig.js';
import {
  getTicketData,
  saveTicketData,
  deleteTicketData,
  getOpenTicketCountForUser,
  incrementTicketCounter,
} from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { createEmbed, errorEmbed } from '../utils/embeds.js';
import { logTicketEvent } from '../utils/ticket/ticketLogging.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import {
  ensureTypedServiceError,
  wrapServiceBoundary,
} from '../utils/serviceErrorBoundary.js';
import { PRIORITY_MAP } from '../utils/helpers.js';

const TICKET_DELETE_DELAY_MS = 3000;
const TICKET_DELETE_DELAY_SECONDS = Math.floor(
  TICKET_DELETE_DELAY_MS / 1000
);
const TICKET_SERVICE = 'ticketService';

/*
 * ============================================================
 * STATIC TICKET PANEL CONFIGURATION
 * ============================================================
 *
 * Change the two panels here if their IDs ever change.
 *
 * Staff roles are used ONLY for channel permissions.
 * Staff roles are NEVER pinged in ticket messages.
 */

export const TICKET_PANELS = {
  normal: {
    id: 'normal',
    channelId: '1541551721908801576',
    title: '🎫 Normal Tickets',
    accentColor: 0xF8D568,
    categoryId: '1542428718826524723',
    staffRoleId: '1541554350797619230',
    logsChannelId: '1542845775988391937',
    transcriptChannelId: '1542845853310390342',
    reviewChannelId: '1542859014499467285',

    buttons: {
      fruity_application: {
        type: 'fruity_application',
        emoji: '📋',
        label: 'Fruity Application',
      },

      general_faq: {
        type: 'general_faq',
        emoji: '❓',
        label: 'General FAQ',
      },

      staff_applications: {
        type: 'staff_applications',
        emoji: '💼',
        label: 'Staff Applications',
      },
    },
  },

  merch: {
    id: 'merch',
    channelId: '1543031129559408660',
    title: '🛍️ Merch Tickets',
    accentColor: 0xF8D568,
    categoryId: '1543352648021966949',
    staffRoleId: '1543556139462164480',
    logsChannelId: '1543331796568121467',
    transcriptChannelId: '1543331916235931678',
    reviewChannelId: '1543332129117708380',

    buttons: {
      returns: {
        type: 'returns',
        emoji: '⛔',
        label: 'Returns',
      },

      inquire: {
        type: 'inquire',
        emoji: '❓',
        label: 'Inquire',
      },

      shipping_help: {
        type: 'shipping_help',
        emoji: '📦',
        label: 'Shipping help',
      },
    },
  },
};

export function getTicketPanel(panelId) {
  return TICKET_PANELS[panelId] || null;
}

function resolveTicketPanel(categoryId, panel = null) {
  if (panel?.panelId && TICKET_PANELS[panel.panelId]) {
    return {
      ...TICKET_PANELS[panel.panelId],
      ...panel,
    };
  }

  const matched = Object.values(TICKET_PANELS).find(
    configured => configured.categoryId === categoryId
  );

  return matched
    ? { ...matched, ...(panel || {}) }
    : (panel || null);
}

function slugifyTicketPart(value, fallback = 'user') {
  return String(value || fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || fallback;
}

function stripTicketDecorations(name) {
  return String(name || '')
    .replace(/^📌\s*/u, '')
    .trim();
}

async function getNextUserTicketChannelName(
  guild,
  ticketType,
  username
) {
  const typeSlug = slugifyTicketPart(
    ticketType,
    'ticket'
  );

  const userSlug = slugifyTicketPart(
    username,
    'user'
  );

  const baseName =
    `${typeSlug}-${userSlug}`.slice(0, 95);

  let channels = guild.channels.cache;

  try {
    channels = await guild.channels.fetch();
  } catch {
    // Use cache if fetching all channels fails.
  }

  const escapedBase = baseName.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );

  const numberedRegex = new RegExp(
    `^${escapedBase}-(\\d+)$`,
    'i'
  );

  let baseExists = false;
  let highestNumber = 0;

  for (const channel of channels.values()) {
    if (
      channel?.type !==
      ChannelType.GuildText
    ) {
      continue;
    }

    const cleanName =
      stripTicketDecorations(channel.name);

    if (
      cleanName.toLowerCase() ===
      baseName.toLowerCase()
    ) {
      baseExists = true;

      highestNumber = Math.max(
        highestNumber,
        1
      );

      continue;
    }

    const match =
      cleanName.match(numberedRegex);

    if (match) {
      highestNumber = Math.max(
        highestNumber,
        Number(match[1]) || 1
      );
    }
  }

  if (
    !baseExists &&
    highestNumber === 0
  ) {
    return {
      name: baseName.slice(0, 100),
      sequence: 1,
    };
  }

  const sequence =
    Math.max(
      highestNumber + 1,
      2
    );

  return {
    name:
      `${baseName}-${sequence}`.slice(
        0,
        100
      ),
    sequence,
  };
}

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

function requireTicket(
  ticketData,
  channel
) {
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
      message:
        `Ticket operation failed: ${operation}`,
      userMessage,
      context,
    }
  );
}

/*
 * ============================================================
 * TICKET CONTROL BUTTONS
 * ============================================================
 *
 * Claim
 * Priority
 * Close
 *
 * Pin has been removed.
 */

function buildTicketControlRow({
  claimedBy = null,
} = {}) {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          'ticket_claim'
        )
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
        .setDisabled(
          !!claimedBy
        ),

      new ButtonBuilder()
        .setCustomId(
          'ticket_priority'
        )
        .setLabel(
          'Priority'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
        .setEmoji('🎯'),

      new ButtonBuilder()
        .setCustomId(
          'ticket_close'
        )
        .setLabel(
          'Close'
        )
        .setStyle(
          ButtonStyle.Danger
        )
        .setEmoji('🔒'),
    );
}

/*
 * ============================================================
 * FIND ORIGINAL TICKET MESSAGE
 * ============================================================
 *
 * New tickets store mainMessageId so all ticket actions can
 * reliably edit the original ticket message.
 *
 * The fallback is kept for older tickets that don't have
 * mainMessageId saved.
 */

function findMainTicketMessage(
  messages,
  ticketData = null
) {
  if (
    ticketData?.mainMessageId
  ) {
    const byId =
      messages.get(
        ticketData.mainMessageId
      );

    if (byId) {
      return byId;
    }
  }

  return (
    messages.find(message => {
      if (
        !message?.embeds?.length
      ) {
        return false;
      }

      const hasTicketFields =
        message.embeds[0].fields?.some(
          field =>
            field.name ===
              'Status' ||
            field.name ===
              'Claimed By'
        );

      const hasControls =
        message.components?.some(
          row =>
            row.components?.some(
              component =>
                [
                  'ticket_claim',
                  'ticket_priority',
                  'ticket_close',
                ].includes(
                  component.customId
                )
            )
        );

      return (
        hasTicketFields &&
        hasControls
      );
    })
  ) ||
    messages.find(message =>
      message?.embeds?.length > 0 &&
      (
        message.embeds[0]
          .title
          ?.startsWith(
            'Ticket #'
          ) ||
        message.embeds[0]
          .title
          ?.endsWith(
            ' Ticket'
          )
      )
    );
}

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
      operation:
        'getUserTicketCount',
      userMessage:
        'Failed to count open tickets.',
      context: {},
    }
  );

/*
 * ============================================================
 * CREATE TICKET
 * ============================================================
 */

export async function createTicket(
  guild,
  member,
  categoryId,
  reason = 'No reason provided',
  priority = 'none',
  panel = null
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
          operation:
            'createTicket',
        }
      );
    }

    const resolvedPanel =
      resolveTicketPanel(
        categoryId,
        panel
      );

    const effectiveCategoryId =
      resolvedPanel?.categoryId ||
      categoryId ||
      null;

    let category =
      effectiveCategoryId
        ? guild.channels.cache.get(
            effectiveCategoryId
          )
        : guild.channels.cache.find(
            c =>
              c.type ===
                ChannelType.GuildCategory &&
              c.name
                .toLowerCase()
                .includes(
                  'tickets'
                )
          );

    if (
      !category &&
      effectiveCategoryId
    ) {
      category =
        await guild.channels.fetch(
          effectiveCategoryId
        ).catch(
          () => null
        );
    }

    if (
      !category &&
      !effectiveCategoryId
    ) {
      category =
        await guild.channels.create({
          name: 'Tickets',
          type:
            ChannelType.GuildCategory,

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

    /*
     * Internal ticket number.
     *
     * This remains in the database and logs,
     * but is NOT shown in the opening message.
     */

    const ticketNumber =
      await getNextTicketNumber(
        guild.id
      );

    /*
     * ========================================================
     * CHANNEL NAMING
     * ========================================================
     *
     * First:
     *   returns-username
     *
     * Second:
     *   returns-username-2
     *
     * Third:
     *   returns-username-3
     */

    const ticketType =
      resolvedPanel?.ticketType ||
      panel?.ticketType ||
      'ticket';

    const username =
      member.user?.username ||
      member.displayName ||
      `user-${member.id}`;

    const {
      name: channelName,
      sequence: ticketSequence,
    } =
      await getNextUserTicketChannelName(
        guild,
        ticketType,
        username
      );

    /*
     * Staff gets access only.
     *
     * There is intentionally NO staff-role mention.
     */

    const staffRoleId =
      resolvedPanel?.staffRoleId ||
      config.ticketStaffRoleId ||
      null;

    const channel =
      await guild.channels.create({
        name: channelName,

        type:
          ChannelType.GuildText,

        parent:
          category?.id,

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

          ...(staffRoleId
            ? [
                {
                  id: staffRoleId,

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

    const ticketLabel =
      resolvedPanel?.ticketLabel ||
      resolvedPanel?.buttons?.[
        ticketType
      ]?.label ||
      panel?.ticketLabel ||
      ticketType;

    const ticketEmoji =
      resolvedPanel?.ticketEmoji ||
      resolvedPanel?.buttons?.[
        ticketType
      ]?.emoji ||
      panel?.ticketEmoji ||
      '🎫';

    const ticketData = {
      id: channel.id,

      /*
       * Discord channel ID.
       *
       * The internal ticket number is still
       * logged separately as ticketNumber.
       */
      channelId: channel.id,

      userId:
        member.id,

      guildId:
        guild.id,

      createdAt:
        new Date().toISOString(),

      status:
        'open',

      claimedBy:
        null,

      priority:
        priority || 'none',

      reason,

      panelId:
        resolvedPanel?.panelId ||
        resolvedPanel?.id ||
        panel?.panelId ||
        null,

      ticketType,

      ticketLabel,

      ticketEmoji,

      ticketSequence,

      ticketChannelName:
        channelName,

      categoryId:
        effectiveCategoryId,

      staffRoleId,

      logsChannelId:
        resolvedPanel?.logsChannelId ||
        config.ticketLogsChannelId ||
        null,

      /*
       * Keep both names for compatibility.
       */
      transcriptChannelId:
        resolvedPanel?.transcriptChannelId ||
        resolvedPanel?.transcriptLogsChannelId ||
        config.ticketTranscriptChannelId ||
        null,

      transcriptLogsChannelId:
        resolvedPanel?.transcriptLogsChannelId ||
        resolvedPanel?.transcriptChannelId ||
        config.ticketTranscriptChannelId ||
        null,

      reviewChannelId:
        resolvedPanel?.reviewChannelId ||
        null,
    };

    await saveTicketData(
      guild.id,
      channel.id,
      ticketData
    );

    /*
     * ========================================================
     * OPENING MESSAGE
     * ========================================================
     *
     * ONE message only.
     *
     * Ticket number is intentionally NOT displayed.
     *
     * Status
     * Claimed By
     *
     * Priority is included in the description so it can be
     * edited in the SAME original message.
     */

    const priorityInfo =
      PRIORITY_MAP[priority] ||
      PRIORITY_MAP.none;

    const thanksText =
      ticketData.panelId ===
      'merch'
        ? 'Thanks for contacting Customer Service!'
        : 'Thanks for contacting our team!';

    const embed =
      createEmbed({
        title:
          `${ticketEmoji} ${ticketLabel} Ticket`,

        description:
          `${thanksText}\n\n` +
          `**Request:** ${ticketLabel}\n` +
          `**Reason:** ${reason}\n` +
          `**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`,

        color:
          resolvedPanel?.accentColor ||
          priorityInfo.color,

        fields: [
          {
            name:
              'Status',

            value:
              '🟢 Open',

            inline:
              true,
          },

          {
            name:
              'Claimed By',

            value:
              'Not claimed',

            inline:
              true,
          },
        ],
      });

    const row =
      buildTicketControlRow();

    /*
     * DO NOT ADD THE STAFF ROLE HERE.
     *
     * The staff role already has channel access through
     * permissionOverwrites above.
     */

    const ticketMessage =
      await channel.send({
        content:
          member.toString(),

        embeds:
          [embed],

        components:
          [row],

        allowedMentions: {
          users: [
            member.id,
          ],
          roles: [],
        },
      });

    /*
     * Save the exact original message ID.
     *
     * Claim, priority, close, reopen and unclaim can now
     * reliably update this same message.
     */

    ticketData.mainMessageId =
      ticketMessage.id;

    await saveTicketData(
      guild.id,
      channel.id,
      ticketData
    );

    await logTicketEvent({
      client:
        guild.client,

      guildId:
        guild.id,

      event: {
        type:
          'open',

        ticketId:
          channel.id,

        ticketNumber,

        userId:
          member.id,

        executorId:
          member.id,

        reason,

        priority:
          priority || 'none',

        metadata: {
          channelId:
            channel.id,

          categoryName:
            category?.name ||
            'Default',

          panelId:
            ticketData.panelId,

          ticketType:
            ticketData.ticketType,

          ticketChannelName:
            channelName,

          logsChannelId:
            ticketData.logsChannelId,

          transcriptChannelId:
            ticketData.transcriptChannelId,

          reviewChannelId:
            ticketData.reviewChannelId,
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
        guildId:
          guild?.id,

        userId:
          member?.id,
      }
    );
  }
}

/*
 * ============================================================
 * CLOSE TICKET
 * ============================================================
 */

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

    ticketData.status =
      'closed';

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

    /*
     * Move to closed category.
     */

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
          .fetch(
            closedCategoryId
          )
          .catch(
            () => null
          );

      if (
        closedCategory?.type ===
        ChannelType.GuildCategory
      ) {
        try {
          await channel.setParent(
            closedCategoryId,
            {
              lockPermissions:
                false,
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

    /*
     * ========================================================
     * CLOSE DM
     * ========================================================
     *
     * This remains separate from the transcript DM.
     */

    if (dmOnClose) {
      try {
        const ticketCreator =
          await channel.client.users
            .fetch(
              ticketData.userId
            )
            .catch(
              () => null
            );

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

              color:
                '#e74c3c',

              footer: {
                text:
                  `Ticket ID: ${ticketData.id}`,
              },
            });

          await ticketCreator.send({
            embeds:
              [dmEmbed],
          });

          /*
           * ==================================================
           * REVIEW / FEEDBACK MESSAGE
           * ==================================================
           *
           * This is intentionally separate from the transcript
           * DM.
           */

          try {
            const feedbackEmbed =
              createEmbed({
                title:
                  '⭐ How was your support experience?',

                description:
                  `We'd love to know how we did with **${channel.name}**.\nSelect a rating below — it only takes a second!`,

                color:
                  '#F1C40F',

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
                    .setCustomId(
                      `${base}:1`
                    )
                    .setLabel(
                      '⭐ 1'
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      `${base}:2`
                    )
                    .setLabel(
                      '⭐ 2'
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      `${base}:3`
                    )
                    .setLabel(
                      '⭐ 3'
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      `${base}:4`
                    )
                    .setLabel(
                      '⭐ 4'
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      `${base}:5`
                    )
                    .setLabel(
                      '⭐ 5'
                    )
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
              embeds:
                [feedbackEmbed],

              components:
                [
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

    /*
     * ========================================================
     * REMOVE OPENER ACCESS AFTER CLOSE
     * ========================================================
     */

    try {
      const user =
        await channel.guild.members
          .fetch(
            ticketData.userId
          )
          .catch(
            () => null
          );

      const targetUser =
        user?.user ||
        await channel.client.users
          .fetch(
            ticketData.userId
          )
          .catch(
            () => null
          );

      if (targetUser) {
        const overwrite =
          channel.permissionOverwrites
            .cache
            .get(
              ticketData.userId
            );

        if (overwrite) {
          await overwrite.edit({
            ViewChannel:
              false,

            SendMessages:
              false,
          });

        } else {
          await channel.permissionOverwrites.create(
            targetUser,
            {
              ViewChannel:
                false,

              SendMessages:
                false,
            }
          );
        }
      }

    } catch (permError) {
      logger.warn(
        `Could not update user permissions for closed ticket: ${permError.message}`
      );
    }

    /*
     * ========================================================
     * UPDATE ORIGINAL TICKET MESSAGE
     * ========================================================
     */

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      findMainTicketMessage(
        messages,
        ticketData
      );

    if (ticketMessage) {
      const embed =
        ticketMessage.embeds[0];

      const statusField =
        embed.fields?.find(
          f =>
            f.name ===
            'Status'
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
            embed.fields ||
            [],

          footer:
            embed.footer
              ? {
                  text:
                    embed.footer.text,

                  iconURL:
                    embed.footer.iconURL ||
                    undefined,
                }
              : undefined,
        });

      await ticketMessage.edit({
        embeds:
          [updatedEmbed],

        components:
          [],
      });
    }

    /*
     * ========================================================
     * CLOSED STATUS MESSAGE
     * ========================================================
     */

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
            .setEmoji(
              '🔓'
            ),

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
            .setEmoji(
              '🗑️'
            ),
        );

    await channel.send({
      embeds:
        [closeEmbed],

      components:
        [controlRow],
    });

    await logTicketEvent({
      client:
        channel.client,

      guildId:
        channel.guild.id,

      event: {
        type:
          'close',

        ticketId:
          channel.id,

        ticketNumber:
          ticketData.id,

        userId:
          ticketData.userId,

        executorId:
          closer.id,

        reason,

        metadata: {
          dmSent:
            dmOnClose,

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

/*
 * ============================================================
 * CLAIM TICKET
 * ============================================================
 */

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
          channelId:
            channel.id,

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

    /*
     * Update the ORIGINAL ticket message.
     */

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      findMainTicketMessage(
        messages,
        ticketData
      );

    if (ticketMessage) {
      const embed =
        ticketMessage.embeds[0];

      const claimedField =
        embed.fields?.find(
          f =>
            f.name ===
            'Claimed By'
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
        embeds:
          [embed],

        components:
          [row],
      });
    }

    /*
     * Separate claim status message.
     *
     * The original ticket message above is still the message
     * that contains the live Claimed By field.
     */

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
            .setEmoji(
              '🔓'
            )
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
        embeds:
          [claimEmbed],

        components:
          [unclaimRow],
      });

    } else {
      await channel.send({
        embeds:
          [claimEmbed],

        components:
          [unclaimRow],
      });
    }

    await logTicketEvent({
      client:
        channel.client,

      guildId:
        channel.guild.id,

      event: {
        type:
          'claim',

        ticketId:
          channel.id,

        ticketNumber:
          ticketData.id,

        userId:
          ticketData.userId,

        executorId:
          claimer.id,

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

/*
 * ============================================================
 * REOPEN TICKET
 * ============================================================
 */

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
      ticketData.categoryId ||
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
          .fetch(
            openCategoryId
          )
          .catch(
            () => null
          );

      if (
        openCategory?.type ===
        ChannelType.GuildCategory
      ) {
        try {
          await channel.setParent(
            openCategoryId,
            {
              lockPermissions:
                false,
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

    /*
     * Restore opener permissions.
     */

    try {
      const user =
        await channel.guild.members
          .fetch(
            ticketData.userId
          )
          .catch(
            () => null
          );

      if (user) {
        await channel.permissionOverwrites.create(
          user,
          {
            ViewChannel:
              true,

            SendMessages:
              true,

            ReadMessageHistory:
              true,

            AttachFiles:
              true,
          }
        );
      }

    } catch (error) {
      logger.warn(
        `Could not restore access for user ${ticketData.userId}:`,
        error.message
      );
    }

    /*
     * Update original ticket message.
     */

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      findMainTicketMessage(
        messages,
        ticketData
      );

    if (ticketMessage) {
      const embed =
        ticketMessage.embeds[0];

      const statusField =
        embed.fields?.find(
          f =>
            f.name ===
            'Status'
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
        embeds:
          [embed],

        components:
          [row],
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
        embeds:
          [reopenEmbed],

        components:
          [],
      });

    } else {
      await channel.send({
        embeds:
          [reopenEmbed],
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

/*
 * ============================================================
 * TRANSCRIPT HELPERS
 * ============================================================
 */

function escapeHtml(text) {
  if (!text) {
    return '';
  }

  return String(text)
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}

async function generateTranscript(
  channel
) {
  try {
    logger.debug(
      'Generating transcript for channel',
      {
        channelId:
          channel.id,

        channelName:
          channel.name,
      }
    );

    const messages = [];

    let before =
      undefined;

    let batch;

    do {
      batch =
        await channel.messages.fetch({
          limit:
            100,

          ...(before
            ? {
                before,
              }
            : {}),
        });

      if (
        batch.size ===
        0
      ) {
        break;
      }

      messages.push(
        ...batch.values()
      );

      before =
        batch.last()?.id;

    } while (
      batch.size ===
      100
    );

    messages.sort(
      (a, b) =>
        a.createdTimestamp -
        b.createdTimestamp
    );

    const escape =
      str =>
        String(str ?? '')
          .replace(
            /&/g,
            '&amp;'
          )
          .replace(
            /</g,
            '&lt;'
          )
          .replace(
            />/g,
            '&gt;'
          )
          .replace(
            /"/g,
            '&quot;'
          );

    const rows =
      messages
        .map(msg => {
          const ts =
            new Date(
              msg.createdTimestamp
            )
              .toISOString()
              .replace(
                'T',
                ' '
              )
              .slice(
                0,
                19
              );

          const author =
            escape(
              msg.author?.tag ??
              msg.author?.username ??
              'Unknown'
            );

          const content =
            escape(
              msg.content ||
              (
                msg.embeds.length
                  ? '[embed]'
                  : '[attachment]'
              )
            );

          return (
            `<tr>` +
            `<td class="ts">${ts}</td>` +
            `<td class="author">${author}</td>` +
            `<td class="msg">${content}</td>` +
            `</tr>`
          );
        })
        .join('\n');

    const html =
      `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript – #${escape(channel.name)}</title>
<style>
body{font-family:sans-serif;background:#36393f;color:#dcddde;margin:0;padding:16px}
h1{color:#fff;font-size:1.2rem;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
th{background:#2f3136;color:#8e9297;padding:6px 8px;text-align:left;border-bottom:2px solid #202225}
td{padding:4px 8px;border-bottom:1px solid #40444b;vertical-align:top}
.ts{color:#72767d;white-space:nowrap;width:160px}
.author{color:#7289da;white-space:nowrap;width:160px}
.msg{word-break:break-word}
</style>
</head>
<body>
<h1>📜 Transcript – #${escape(channel.name)}</h1>
<p style="color:#72767d">${messages.length} message(s) exported on ${new Date().toUTCString()}</p>
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
</body>
</html>`;

    const buffer =
      Buffer.from(
        html,
        'utf8'
      );

    const filename =
      `ticket-${channel.id}.html`;

    logger.info(
      '✅ Successfully generated transcript',
      {
        channelId:
          channel.id,

        channelName:
          channel.name,

        messageCount:
          messages.length,

        size:
          buffer.length,
      }
    );

    /*
     * Return raw buffer data so we can create a fresh
     * AttachmentBuilder for BOTH the transcript channel
     * and the user's DM.
     */

    return {
      buffer,
      filename,
    };

  } catch (error) {
    logger.error(
      '❌ Failed to generate transcript:',
      {
        channelId:
          channel.id,

        channelName:
          channel.name,

        errorMessage:
          error.message,

        errorName:
          error.name,

        errorStack:
          error.stack,
      }
    );

    return null;
  }
}

/*
 * ============================================================
 * DELETE TICKET
 * ============================================================
 *
 * Transcript is sent to:
 *
 * 1. The panel's configured transcript log channel.
 * 2. The ticket creator's DMs.
 *
 * The review DM remains separate and is handled when the
 * ticket is closed.
 */

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
      embeds:
        [deleteEmbed],
    });

    await logTicketEvent({
      client:
        channel.client,

      guildId:
        channel.guild.id,

      event: {
        type:
          'delete',

        ticketId:
          channel.id,

        ticketNumber:
          ticketData.id,

        userId:
          ticketData.userId,

        executorId:
          deleter.id,

        metadata: {
          deletedAt:
            new Date().toISOString(),
        },
      },
    });

    setTimeout(
      async () => {
        try {
          logger.debug(
            'Starting ticket deletion process',
            {
              channelId:
                channel.id,

              ticketId:
                ticketData.id,
            }
          );

          let attachment =
            null;

          /*
           * Generate transcript BEFORE deleting channel.
           */

          try {
            attachment =
              await generateTranscript(
                channel
              );

            if (attachment) {
              logger.info(
                'Transcript generated successfully, attempting to send',
                {
                  channelId:
                    channel.id,

                  ticketNumber:
                    ticketData.id,
                }
              );

            } else {
              logger.warn(
                'Transcript generation returned null',
                {
                  channelId:
                    channel.id,

                  ticketNumber:
                    ticketData.id,
                }
              );
            }

          } catch (transcriptError) {
            logger.error(
              'Error during transcript generation',
              {
                channelId:
                  channel.id,

                ticketNumber:
                  ticketData.id,

                error:
                  transcriptError.message,
              }
            );
          }

          /*
           * ==================================================
           * SEND TRANSCRIPT TO PANEL TRANSCRIPT CHANNEL
           * ==================================================
           */

          if (attachment) {
            const transcriptChannelId =
              ticketData.transcriptLogsChannelId ||
              ticketData.transcriptChannelId ||
              null;

            if (
              !transcriptChannelId
            ) {
              logger.warn(
                'No transcript channel configured, skipping transcript channel send',
                {
                  channelId:
                    channel.id,

                  ticketNumber:
                    ticketData.id,
                }
              );

            } else {
              try {
                const transcriptChannel =
                  await channel.client.channels
                    .fetch(
                      transcriptChannelId
                    )
                    .catch(
                      () => null
                    );

                if (
                  !transcriptChannel
                ) {
                  logger.error(
                    'Could not fetch transcript channel',
                    {
                      channelId:
                        channel.id,

                      transcriptChannelId,
                    }
                  );

                } else if (
                  !transcriptChannel.isSendable()
                ) {
                  logger.error(
                    'Transcript channel exists but is not sendable',
                    {
                      channelId:
                        channel.id,

                      transcriptChannelId:
                        transcriptChannel.id,
                    }
                  );

                } else {
                  const transcriptEmbed =
                    buildStandardLogEmbed({
                      color:
                        0x3498db,

                      title:
                        'Ticket Transcript',

                      description:
                        [
                          formatLogLine(
                            'Ticket',
                            `#${ticketData.id}`
                          ),

                          formatLogLine(
                            'Channel',
                            `#${channel.name}`
                          ),

                          formatLogLine(
                            'Generated',
                            `<t:${Math.floor(Date.now() / 1000)}:F>`
                          ),
                        ].join(
                          '\n'
                        ),

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

                  /*
                   * IMPORTANT:
                   * Create a fresh AttachmentBuilder for this
                   * destination.
                   */

                  const channelAttachment =
                    new AttachmentBuilder(
                      attachment.buffer,
                      {
                        name:
                          attachment.filename,
                      }
                    );

                  await transcriptChannel.send({
                    embeds:
                      [transcriptEmbed],

                    files:
                      [channelAttachment],
                  });

                  logger.info(
                    '✅ Transcript sent successfully to transcript channel',
                    {
                      channelId:
                        channel.id,

                      ticketNumber:
                        ticketData.id,

                      transcriptChannelId:
                        transcriptChannel.id,
                    }
                  );
                }

              } catch (sendError) {
                logger.error(
                  'Failed to send transcript to channel:',
                  {
                    channelId:
                      channel.id,

                    ticketNumber:
                      ticketData.id,

                    error:
                      sendError.message,
                  }
                );
              }
            }

            /*
             * ==================================================
             * SEND TRANSCRIPT TO TICKET CREATOR DM
             * ==================================================
             *
             * This is a SEPARATE message from the review DM.
             */

            try {
              const ticketCreator =
                await channel.client.users
                  .fetch(
                    ticketData.userId
                  )
                  .catch(
                    () => null
                  );

              if (
                ticketCreator
              ) {
                const panelName =
                  ticketData.panelId ===
                    'merch' ||
                  ticketData.panelType ===
                    'merch'
                    ? 'Merch'
                    : 'Normal';

                const dmEmbed =
                  createEmbed({
                    title:
                      `📄 ${panelName} Ticket Transcript`,

                    description:
                      `Here is the transcript for your **${channel.name}** ticket.\n\n` +
                      `The ticket has now been permanently deleted.`,

                    color:
                      0x3498db,

                    footer: {
                      text:
                        `Ticket ID: ${ticketData.id}`,
                    },
                  });

                const dmAttachment =
                  new AttachmentBuilder(
                    attachment.buffer,
                    {
                      name:
                        attachment.filename,
                    }
                  );

                await ticketCreator.send({
                  embeds:
                    [dmEmbed],

                  files:
                    [dmAttachment],
                });

                logger.info(
                  '✅ Transcript sent successfully to ticket creator DM',
                  {
                    channelId:
                      channel.id,

                    ticketNumber:
                      ticketData.id,

                    userId:
                      ticketData.userId,
                  }
                );

              } else {
                logger.warn(
                  'Could not fetch ticket creator for transcript DM',
                  {
                    channelId:
                      channel.id,

                    ticketNumber:
                      ticketData.id,

                    userId:
                      ticketData.userId,
                  }
                );
              }

            } catch (dmError) {
              /*
               * DM failure must NOT stop the transcript channel
               * delivery or channel deletion.
               */

              logger.warn(
                'Could not send transcript DM to ticket creator',
                {
                  channelId:
                    channel.id,

                  ticketNumber:
                    ticketData.id,

                  userId:
                    ticketData.userId,

                  error:
                    dmError.message,
                }
              );
            }
          }

          /*
           * ==================================================
           * DELETE CHANNEL
           * ==================================================
           */

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
              '❌ Failed to delete ticket channel:',
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
            '❌ Unexpected error during ticket deletion:',
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

/*
 * ============================================================
 * UNCLAIM TICKET
 * ============================================================
 */

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

    if (
      !ticketData.claimedBy
    ) {
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

    /*
     * Update original ticket message.
     */

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      findMainTicketMessage(
        messages,
        ticketData
      );

    if (ticketMessage) {
      const embed =
        ticketMessage.embeds[0];

      const claimedField =
        embed.fields?.find(
          f =>
            f.name ===
            'Claimed By'
        );

      if (claimedField) {
        claimedField.value =
          'Not claimed';
      }

      const row =
        buildTicketControlRow();

      await ticketMessage.edit({
        embeds:
          [embed],

        components:
          [row],
      });
    }

    /*
     * Update separate claim status message.
     */

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

    if (claimMessage) {
      const unclaimEmbed =
        createEmbed({
          title:
            'Ticket Unclaimed',

          description:
            `🔓 ${unclaimer} has unclaimed this ticket!`,

          color:
            '#f39c12',
        });

      await claimMessage.edit({
        embeds:
          [unclaimEmbed],

        components:
          [],
      });

    } else {
      const unclaimEmbed =
        createEmbed({
          title:
            'Ticket Unclaimed',

          description:
            `🔓 ${unclaimer} has unclaimed this ticket!`,

          color:
            '#f39c12',
        });

      await channel.send({
        embeds:
          [unclaimEmbed],
      });
    }

    await logTicketEvent({
      client:
        channel.client,

      guildId:
        channel.guild.id,

      event: {
        type:
          'unclaim',

        ticketId:
          channel.id,

        ticketNumber:
          ticketData.id,

        userId:
          ticketData.userId,

        executorId:
          unclaimer.id,

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

/*
 * ============================================================
 * TICKET NUMBER
 * ============================================================
 */

async function getNextTicketNumber(
  guildId
) {
  return await incrementTicketCounter(
    guildId
  );
}

/*
 * ============================================================
 * UPDATE TICKET PRIORITY
 * ============================================================
 *
 * Priority is now updated directly inside the ORIGINAL ticket
 * message.
 *
 * No extra "Priority Updated" message is sent.
 */

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

    /*
     * Save the old priority BEFORE replacing it.
     */

    const previousPriority =
      ticketData.priority ||
      'none';

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

    /*
     * Find and update original ticket message.
     */

    const messages =
      await channel.messages.fetch();

    const ticketMessage =
      findMainTicketMessage(
        messages,
        ticketData
      );

    if (
      ticketMessage?.embeds?.length
    ) {
      const embed =
        ticketMessage.embeds[0];

      const descriptionLines =
        String(
          embed.description ||
          ''
        ).split('\n');

      const priorityLine =
        `**Priority:** ${priorityInfo.emoji} ${priorityInfo.label}`;

      const priorityIndex =
        descriptionLines.findIndex(
          line =>
            line
              .trim()
              .startsWith(
                '**Priority:**'
              )
        );

      if (
        priorityIndex >= 0
      ) {
        descriptionLines[
          priorityIndex
        ] =
          priorityLine;

      } else {
        descriptionLines.push(
          priorityLine
        );
      }

      const updatedEmbed =
        createEmbed({
          title:
            embed.title ||
            'Ticket',

          description:
            descriptionLines.join(
              '\n'
            ),

          /*
           * Keep the original ticket's accent color rather than
           * changing the entire embed to the priority color.
           */
          color:
            ticketMessage.embeds[0]
              .color ||
            priorityInfo.color,

          fields:
            embed.fields ||
            [],

          footer:
            embed.footer
              ? {
                  text:
                    embed.footer.text,

                  iconURL:
                    embed.footer.iconURL ||
                    undefined,
                }
              : undefined,
        });

      await ticketMessage.edit({
        embeds:
          [updatedEmbed],
      });
    }

    /*
     * Do NOT send a separate Priority Updated message.
     */

    await logTicketEvent({
      client:
        channel.client,

      guildId:
        channel.guild.id,

      event: {
        type:
          'priority',

        ticketId:
          channel.id,

        ticketNumber:
          ticketData.id,

        userId:
          ticketData.userId,

        executorId:
          updater.id,

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
