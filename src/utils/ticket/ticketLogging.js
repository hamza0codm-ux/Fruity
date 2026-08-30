// ticketLogging.js

import { ChannelType } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getTicketData } from '../../services/ticket.js';
import { logger } from '../logger.js';
import {
  buildStandardLogEmbed,
  formatRatingStars,
  resolveUserAuthor,
} from '../logging/logEmbeds.js';

/*
|--------------------------------------------------------------------------
| LOG CHANNELS
|--------------------------------------------------------------------------
|
| NORMAL
| Ticket/action logs : 1542845775988391937
| Transcript logs    : 1542845853310390342
| Review logs       : 1542859014499467285
|
| MERCH
| Ticket/action logs : 1543331796568121467
| Transcript logs    : 1543331916235931678
| Review logs       : 1543332129117708380
|
|--------------------------------------------------------------------------
*/

const NORMAL_LOG_CHANNELS = {
  ticket: '1542845775988391937',
  transcript: '1542845853310390342',
  review: '1542859014499467285',
};

const MERCH_LOG_CHANNELS = {
  ticket: '1543331796568121467',
  transcript: '1543331916235931678',
  review: '1543332129117708380',
};

/*
|--------------------------------------------------------------------------
| Determine whether a ticket belongs to Normal or Merch
|--------------------------------------------------------------------------
*/

async function getTicketPanelType(guildId, ticketId) {
  if (!guildId || !ticketId) {
    return null;
  }

  try {
    const ticketData = await getTicketData(guildId, ticketId);

    if (!ticketData) {
      return null;
    }

    const panelType = String(
      ticketData.panelType ||
      ticketData.ticketPanel ||
      ticketData.panel ||
      ticketData.ticketType ||
      ''
    ).toLowerCase();

    if (panelType === 'merch') {
      return 'merch';
    }

    if (panelType === 'normal') {
      return 'normal';
    }

    return null;
  } catch (error) {
    logger.warn(
      `Unable to determine panel type for ticket ${ticketId}: ${error.message}`
    );

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| Get the correct log channel
|--------------------------------------------------------------------------
|
| Event types:
|
| open / close / delete / claim / unclaim / priority / pin / unpin
|     -> ticket/action logs
|
| transcript
|     -> transcript logs
|
| feedback
|     -> review logs
|
|--------------------------------------------------------------------------
*/

async function getLogChannelForEvent({
  client,
  guildId,
  event,
  config,
}) {
  const eventType = String(event?.type || '').toLowerCase();

  /*
   * First try to determine the panel from the actual ticket.
   */
  let panelType = await getTicketPanelType(
    guildId,
    event?.ticketId
  );

  /*
   * If the ticket data is unavailable, allow the event itself
   * to provide the panel type.
   */
  if (!panelType) {
    const eventPanelType = String(
      event?.panelType ||
      event?.metadata?.panelType ||
      event?.ticketType ||
      event?.metadata?.ticketType ||
      ''
    ).toLowerCase();

    if (
      eventPanelType === 'normal' ||
      eventPanelType === 'merch'
    ) {
      panelType = eventPanelType;
    }
  }

  /*
   * Use the correct hardcoded panel configuration.
   */
  const panelChannels =
    panelType === 'merch'
      ? MERCH_LOG_CHANNELS
      : NORMAL_LOG_CHANNELS;

  /*
   * If we know the ticket's panel, use the panel's
   * dedicated channels.
   */
  if (panelType === 'merch' || panelType === 'normal') {
    switch (eventType) {
      case 'transcript':
        return panelChannels.transcript;

      case 'feedback':
        return panelChannels.review;

      case 'open':
      case 'close':
      case 'delete':
      case 'claim':
      case 'unclaim':
      case 'priority':
      case 'pin':
      case 'unpin':
      default:
        return panelChannels.ticket;
    }
  }

  /*
   * Fallback to the existing guild configuration if the
   * ticket cannot be identified.
   */
  switch (eventType) {
    case 'transcript':
      return (
        config.ticketTranscriptChannelId ||
        config.transcriptLogsChannelId ||
        null
      );

    case 'feedback':
      return (
        config.ticketReviewChannelId ||
        config.reviewLogsChannelId ||
        null
      );

    case 'open':
    case 'close':
    case 'delete':
    case 'claim':
    case 'unclaim':
    case 'priority':
    case 'pin':
    case 'unpin':
      return (
        config.ticketLogsChannelId ||
        null
      );

    default:
      return null;
  }
}

/*
|--------------------------------------------------------------------------
| Main ticket event logger
|--------------------------------------------------------------------------
*/

export async function logTicketEvent({
  client,
  guildId,
  event,
}) {
  try {
    if (!client) {
      logger.warn(
        'logTicketEvent called without a client.'
      );
      return false;
    }

    if (!guildId) {
      logger.warn(
        'logTicketEvent called without a guildId.'
      );
      return false;
    }

    if (!event?.type) {
      logger.warn(
        'logTicketEvent called without an event type.'
      );
      return false;
    }

    const guild =
      client.guilds.cache.get(guildId) ||
      await client.guilds
        .fetch(guildId)
        .catch(() => null);

    if (!guild) {
      logger.warn(
        `logTicketEvent invoked without valid guild: ${guildId}`
      );
      return false;
    }

    const config =
      await getGuildConfig(
        client,
        guildId
      );

    const logChannelId =
      await getLogChannelForEvent({
        client,
        guildId,
        event,
        config,
      });

    if (!logChannelId) {
      logger.warn(
        `No log channel configured for event type: ${event.type}`
      );
      return false;
    }

    const channel =
      guild.channels.cache.get(logChannelId) ||
      await guild.channels
        .fetch(logChannelId)
        .catch(() => null);

    if (!channel) {
      logger.warn(
        `Ticket log channel not found: ${logChannelId} for event type: ${event.type}`
      );
      return false;
    }

    if (!channel.isTextBased()) {
      logger.warn(
        `Ticket log channel ${logChannelId} is not text based.`
      );
      return false;
    }

    const botMember =
      guild.members.me ||
      await guild.members
        .fetch(client.user.id)
        .catch(() => null);

    if (!botMember) {
      logger.warn(
        `Unable to resolve bot member in guild ${guildId}.`
      );
      return false;
    }

    const permissions =
      channel.permissionsFor(botMember);

    if (
      !permissions ||
      !permissions.has([
        'SendMessages',
        'EmbedLinks',
      ])
    ) {
      logger.warn(
        `Missing permissions in ticket log channel: ${logChannelId}`
      );
      return false;
    }

    const embed =
      await createTicketLogEmbed(
        guild,
        event
      );

    const messageOptions = {
      embeds: [embed],
    };

    if (
      event.attachments &&
      event.attachments.length > 0
    ) {
      messageOptions.files =
        event.attachments;
    }

    await channel.send(
      messageOptions
    );

    logger.info(
      `Ticket event logged: ${event.type} -> ${logChannelId}`
    );

    return true;
  } catch (error) {
    logger.error(
      'Error logging ticket event:',
      error
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Review / Feedback logger
|--------------------------------------------------------------------------
*/

export async function logTicketFeedback({
  client,
  guildId,
  ticketNumber,
  ticketChannelId,
  userId,
  rating = null,
  comment = null,
}) {
  return await logTicketEvent({
    client,
    guildId,
    event: {
      type: 'feedback',
      ticketId: ticketChannelId,
      ticketNumber,
      userId,

      metadata: {
        rating,
        comment,
      },
    },
  });
}

/*
|--------------------------------------------------------------------------
| Legacy helper
|--------------------------------------------------------------------------
|
| Kept exported so any existing code importing
| getLogChannelForEventType does not immediately break.
|
| This helper uses the guild config only.
| The main logger above uses ticket-specific routing.
|--------------------------------------------------------------------------
*/

function getLogChannelForEventType(
  config,
  eventType
) {
  switch (eventType) {
    case 'transcript':
      return (
        config.ticketTranscriptChannelId ||
        config.transcriptLogsChannelId ||
        null
      );

    case 'feedback':
      return (
        config.ticketReviewChannelId ||
        config.reviewLogsChannelId ||
        null
      );

    case 'open':
    case 'close':
    case 'delete':
    case 'claim':
    case 'unclaim':
    case 'priority':
    case 'pin':
    case 'unpin':
      return (
        config.ticketLogsChannelId ||
        null
      );

    default:
      return null;
  }
}

/*
|--------------------------------------------------------------------------
| Event styles
|--------------------------------------------------------------------------
*/

const TICKET_EVENT_STYLES = {
  open: {
    color: 0x5865F2,
    title: 'Ticket Created',
  },

  close: {
    color: 0xED4245,
    title: 'Ticket Closed',
  },

  delete: {
    color: 0x8B0000,
    title: 'Ticket Deleted',
  },

  claim: {
    color: 0x5865F2,
    title: 'Ticket Claimed',
  },

  unclaim: {
    color: 0xFAA61A,
    title: 'Ticket Unclaimed',
  },

  priority: {
    color: 0x9B59B6,
    title: 'Priority Updated',
  },

  pin: {
    color: 0x3498DB,
    title: 'Ticket Pinned',
  },

  unpin: {
    color: 0x95A5A6,
    title: 'Ticket Unpinned',
  },

  transcript: {
    color: 0x57F287,
    title: 'Transcript Generated',
  },

  feedback: {
    color: 0x57F287,
    title: 'Feedback Received',
  },
};

/*
|--------------------------------------------------------------------------
| Build ticket log embed
|--------------------------------------------------------------------------
*/

async function createTicketLogEmbed(
  guild,
  event
) {
  const style =
    TICKET_EVENT_STYLES[event.type] ||
    {
      color: 0x95A5A6,
      title: 'Ticket Event',
    };

  const ticketNumber =
    event.ticketNumber ||
    event.ticketId;

  const ticketRef =
    ticketNumber
      ? `#${ticketNumber}`
      : 'Unknown';

  const channelMention =
    event.ticketId
      ? `<#${event.ticketId}>`
      : null;

  const executorMention =
    event.executorId
      ? `<@${event.executorId}>`
      : null;

  const userMention =
    event.userId
      ? `<@${event.userId}>`
      : null;

  let inlineFields = [];
  let fields = [];
  let author = null;

  const footer = {
    text: 'TitanBot Ticketing',
  };

  switch (event.type) {
    case 'open':
      author =
        await resolveUserAuthor(
          guild.client,
          event.userId
        );

      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name: 'Creator',
          value:
            userMention ||
            'Unknown',
          inline: true,
        },
      ];

      if (channelMention) {
        inlineFields.push({
          name: 'Channel',
          value: channelMention,
          inline: true,
        });
      }

      if (event.reason) {
        fields.push({
          name: 'Reason',
          value: String(
            event.reason
          ).slice(0, 1024),
          inline: false,
        });
      }

      break;

    case 'close':
      author =
        await resolveUserAuthor(
          guild.client,
          event.executorId
        );

      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name: 'Closed by',
          value:
            executorMention ||
            'Unknown',
          inline: true,
        },
      ];

      if (channelMention) {
        inlineFields.push({
          name: 'Channel',
          value: channelMention,
          inline: true,
        });
      }

      if (event.reason) {
        fields.push({
          name: 'Reason',
          value: String(
            event.reason
          ).slice(0, 1024),
          inline: false,
        });
      }

      break;

    case 'delete':
      author =
        await resolveUserAuthor(
          guild.client,
          event.executorId
        );

      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name: 'Deleted by',
          value:
            executorMention ||
            'Unknown',
          inline: true,
        },
      ];

      break;

    case 'claim':
    case 'unclaim':
      author =
        await resolveUserAuthor(
          guild.client,
          event.executorId
        );

      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name:
            event.type === 'claim'
              ? 'Claimed by'
              : 'Unclaimed by',

          value:
            executorMention ||
            'Unknown',

          inline: true,
        },
      ];

      break;

    case 'priority': {
      const priorityEmojis = {
        none: '⚪',
        low: '🔵',
        medium: '🟢',
        high: '🟡',
        urgent: '🔴',
      };

      const priority =
        event.priority ||
        event.metadata?.priority ||
        'none';

      const priorityLabel =
        `${priorityEmojis[priority] || '⚪'} ` +
        `${String(priority)
          .charAt(0)
          .toUpperCase()}${String(priority)
          .slice(1)}`;

      author =
        await resolveUserAuthor(
          guild.client,
          event.executorId
        );

      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name: 'Priority',
          value: priorityLabel,
          inline: true,
        },
        {
          name: 'Updated by',
          value:
            executorMention ||
            'Unknown',
          inline: true,
        },
      ];

      break;
    }

    case 'pin':
    case 'unpin':
      author =
        await resolveUserAuthor(
          guild.client,
          event.executorId
        );

      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name:
            event.type === 'pin'
              ? 'Pinned by'
              : 'Unpinned by',

          value:
            executorMention ||
            'Unknown',

          inline: true,
        },
      ];

      if (event.metadata?.newChannelName) {
        fields.push({
          name: 'Channel Name',
          value: String(
            event.metadata.newChannelName
          ).slice(0, 1024),
          inline: false,
        });
      }

      break;

    case 'transcript':
      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name: 'Creator',
          value:
            userMention ||
            'Unknown',
          inline: true,
        },
      ];

      if (event.metadata?.messageCount) {
        inlineFields.push({
          name: 'Messages',
          value: String(
            event.metadata.messageCount
          ),
          inline: true,
        });
      }

      if (event.metadata?.duration) {
        fields.push({
          name: 'Duration',
          value: String(
            event.metadata.duration
          ),
          inline: false,
        });
      }

      if (
        event.metadata?.subject ||
        event.reason
      ) {
        fields.push({
          name: 'Subject',
          value: String(
            event.metadata?.subject ||
            event.reason
          ).slice(0, 1024),
          inline: false,
        });
      }

      break;

    case 'feedback': {
      const rating =
        event.metadata?.rating ??
        event.rating;

      const comment =
        event.metadata?.comment ??
        event.comment;

      const ratingDisplay =
        formatRatingStars(
          rating
        ) ||
        'No rating';

      author =
        await resolveUserAuthor(
          guild.client,
          event.userId
        );

      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
        {
          name: 'Rating',
          value: ratingDisplay,
          inline: true,
        },
      ];

      if (channelMention) {
        inlineFields.push({
          name: 'Ticket Channel',
          value: channelMention,
          inline: true,
        });
      }

      if (comment) {
        fields.push({
          name: 'Comment',
          value: String(
            comment
          ).slice(0, 1024),
          inline: false,
        });
      }

      break;
    }

    default:
      inlineFields = [
        {
          name: 'Ticket',
          value: ticketRef,
          inline: true,
        },
      ];

      if (event.reason) {
        fields.push({
          name: 'Details',
          value: String(
            event.reason
          ).slice(0, 1024),
          inline: false,
        });
      }
  }

  const titlePrefix =
    event.type === 'feedback'
      ? '⭐ '
      : event.type === 'transcript'
        ? '📄 '
        : '';

  return buildStandardLogEmbed({
    color: style.color,
    title:
      `${titlePrefix}${style.title}`,
    inlineFields,
    fields,
    author,
    footer,
  });
}

/*
|--------------------------------------------------------------------------
| Logging configuration
|--------------------------------------------------------------------------
*/

export async function getTicketLoggingConfig(
  client,
  guildId
) {
  const config =
    await getGuildConfig(
      client,
      guildId
    );

  return {
    enabled: Boolean(
      config.ticketLogsChannelId ||
      config.ticketTranscriptChannelId ||
      config.ticketReviewChannelId ||
      config.transcriptLogsChannelId ||
      config.reviewLogsChannelId
    ),

    lifecycleChannelId:
      config.ticketLogsChannelId ||
      null,

    transcriptChannelId:
      config.ticketTranscriptChannelId ||
      config.transcriptLogsChannelId ||
      null,

    reviewChannelId:
      config.ticketReviewChannelId ||
      config.reviewLogsChannelId ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| Validate log channel
|--------------------------------------------------------------------------
*/

export function validateLogChannel(
  channel,
  botMember
) {
  if (
    !channel ||
    channel.type !== ChannelType.GuildText
  ) {
    return {
      valid: false,
      error:
        'Channel must be a text channel.',
    };
  }

  const permissions =
    channel.permissionsFor(
      botMember
    );

  const requiredPermissions = [
    'SendMessages',
    'EmbedLinks',
  ];

  const missing =
    requiredPermissions.filter(
      permission =>
        !permissions.has(
          permission
        )
    );

  if (missing.length > 0) {
    return {
      valid: false,
      error:
        `Missing permissions: ${missing.join(', ')}`,
    };
  }

  return {
    valid: true,
  };
}
