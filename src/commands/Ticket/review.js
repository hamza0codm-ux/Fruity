import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

/*
|--------------------------------------------------------------------------
| LOG CHANNELS
|--------------------------------------------------------------------------
*/

const NORMAL = {
  ticketLog: '1542845775988391937',
  reviewLog: '1542859014499467285',
};

const MERCH = {
  ticketLog: '1543331796568121467',
  reviewLog: '1543332129117708380',
};

const MIN_CLAIMS = 5;
const PAGE_SIZE = 8;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getEmbedText(embed) {
  if (!embed) return '';

  return [
    embed.title,
    embed.description,
    ...(embed.fields || []).flatMap(field => [
      field.name,
      field.value,
    ]),
  ]
    .filter(Boolean)
    .join(' ');
}

function getField(embed, names) {
  if (!embed) return null;

  const wanted = Array.isArray(names)
    ? names
    : [names];

  const normalized = wanted.map(name =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );

  const field = (embed.fields || []).find(field => {
    const fieldName = String(field.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    return normalized.includes(fieldName);
  });

  return field?.value || null;
}

/*
|--------------------------------------------------------------------------
| USER ID EXTRACTION
|--------------------------------------------------------------------------
*/

function extractUserId(value) {
  if (!value) return null;

  const text = String(value);

  // <@123456789>
  // <@!123456789>
  const mention = text.match(
    /<@!?(\d{17,20})>/
  );

  if (mention) {
    return mention[1];
  }

  // Raw Discord ID
  const rawId = text.match(
    /\b\d{17,20}\b/
  );

  if (rawId) {
    return rawId[0];
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| CLAIM STAFF DETECTION
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| We don't depend on one exact field name anymore.
|
| The claim log may contain:
|
| Claimed By
| Claimed by
| Claimer
| Staff
| Executor
|
| We also inspect the description and entire embed.
|
*/

function extractClaimedStaffId(message) {
  const embed = message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * First: exact/common field names.
   */

  const directFields = [
    'Claimed By',
    'Claimed by',
    'Claimer',
    'Staff',
    'Staff Member',
    'Claimed Staff',
    'Executor',
  ];

  for (const fieldName of directFields) {
    const value = getField(
      embed,
      fieldName
    );

    const id = extractUserId(value);

    if (id) {
      return id;
    }
  }

  /*
   * Second: inspect every field.
   */

  for (const field of embed.fields || []) {
    const name = String(
      field.name || ''
    ).toLowerCase();

    const value = String(
      field.value || ''
    );

    if (
      name.includes('claim') ||
      name.includes('staff') ||
      name.includes('executor')
    ) {
      const id =
        extractUserId(value);

      if (id) {
        return id;
      }
    }
  }

  /*
   * Third: inspect description.
   */

  const description =
    String(embed.description || '');

  const descriptionPatterns = [
    /claimed\s*(?:by|:)\s*<@!?(\d{17,20})>/i,
    /claim(?:ed)?\s*(?:by|:)\s*(\d{17,20})/i,
    /staff\s*(?:member|user)?\s*(?:is|:|-)\s*<@!?(\d{17,20})>/i,
    /executor\s*(?:is|:|-)\s*<@!?(\d{17,20})>/i,
  ];

  for (
    const pattern of
    descriptionPatterns
  ) {
    const match =
      description.match(pattern);

    if (match) {
      return match[1];
    }
  }

  /*
   * Fourth: inspect entire embed.
   */

  const text =
    getEmbedText(embed);

  const patterns = [
    /claimed\s*(?:by|:)\s*<@!?(\d{17,20})>/i,
    /claim(?:ed)?\s*(?:by|:)\s*(\d{17,20})/i,
    /claimed\s+<@!?(\d{17,20})>/i,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| TICKET NUMBER
|--------------------------------------------------------------------------
*/

function extractTicketNumber(message) {
  const embed =
    message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * Try Ticket field first.
   */

  const ticketField =
    getField(
      embed,
      [
        'Ticket',
        'Ticket Number',
        'Ticket ID',
      ]
    );

  if (ticketField) {
    const match =
      String(ticketField).match(
        /#?\s*(\d+)/
      );

    if (match) {
      return match[1];
    }
  }

  /*
   * Search all fields.
   */

  for (
    const field of
    embed.fields || []
  ) {
    const fieldName =
      String(
        field.name || ''
      ).toLowerCase();

    if (
      fieldName.includes('ticket') ||
      fieldName.includes('number')
    ) {
      const match =
        String(
          field.value || ''
        ).match(
          /#?\s*(\d+)/
        );

      if (match) {
        return match[1];
      }
    }
  }

  /*
   * Search the complete embed.
   */

  const text =
    getEmbedText(embed);

  const patterns = [
    /ticket(?:\s*(?:number|id))?\s*[:#-]?\s*(\d+)/i,
    /#(\d{1,})/,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| RATING
|--------------------------------------------------------------------------
*/

function extractRating(message) {
  const embed =
    message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  const ratingField =
    getField(
      embed,
      [
        'Rating',
        'Review Rating',
        'Stars',
      ]
    );

  if (ratingField) {
    const value =
      String(ratingField);

    const stars =
      (
        value.match(/⭐/g) || []
      ).length;

    if (
      stars >= 1 &&
      stars <= 5
    ) {
      return stars;
    }

    const numeric =
      value.match(
        /\b([1-5])(?:\s*\/\s*5)?\b/
      );

    if (numeric) {
      return Number(
        numeric[1]
      );
    }
  }

  /*
   * Entire embed fallback.
   */

  const text =
    getEmbedText(embed);

  const numeric =
    text.match(
      /rating\s*[:\-]?\s*([1-5])(?:\s*\/\s*5)?/i
    );

  if (numeric) {
    return Number(
      numeric[1]
    );
  }

  const stars =
    (
      text.match(/⭐/g) || []
    ).length;

  if (
    stars >= 1 &&
    stars <= 5
  ) {
    return stars;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| FETCH ALL MESSAGES
|--------------------------------------------------------------------------
*/

async function fetchAllMessages(channel) {
  const messages = [];

  let before = null;

  while (true) {
    const batch =
      await channel.messages.fetch({
        limit: 100,
        ...(before
          ? { before }
          : {}),
      });

    if (!batch.size) {
      break;
    }

    messages.push(
      ...batch.values()
    );

    if (batch.size < 100) {
      break;
    }

    before =
      batch.last()?.id;

    if (!before) {
      break;
    }
  }

  return messages;
}

/*
|--------------------------------------------------------------------------
| STAT STRUCTURE
|--------------------------------------------------------------------------
*/

function createStats(userId) {
  return {
    userId,
    claims: 0,
    reviews: 0,
    totalRating: 0,
    average: 0,

    ratings: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    },
  };
}

/*
|--------------------------------------------------------------------------
| CLAIM EVENT DETECTION
|--------------------------------------------------------------------------
*/

function isClaimEvent(message) {
  const embed =
    message?.embeds?.[0];

  if (!embed) {
    return false;
  }

  const title =
    String(
      embed.title || ''
    )
    .toLowerCase()
    .trim();

  /*
   * Exact normal formats.
   */

  if (
    title === 'ticket claimed' ||
    title === '🎫 ticket claimed' ||
    title === '🙋 ticket claimed'
  ) {
    return true;
  }

  /*
   * More tolerant formats.
   */

  if (
    title.includes('ticket claimed') &&
    !title.includes('unclaimed')
  ) {
    return true;
  }

  /*
   * Inspect embed text as a fallback.
   */

  const text =
    getEmbedText(embed)
      .toLowerCase();

  if (
    text.includes('ticket claimed') &&
    !text.includes('ticket unclaimed')
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| REVIEW EVENT DETECTION
|--------------------------------------------------------------------------
*/

function isReviewEvent(message) {
  const embed =
    message?.embeds?.[0];

  if (!embed) {
    return false;
  }

  const title =
    String(
      embed.title || ''
    )
    .toLowerCase()
    .trim();

  if (
    title === '⭐ feedback received' ||
    title === 'feedback received'
  ) {
    return true;
  }

  if (
    title.includes('feedback received')
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| COLLECT STATISTICS
|--------------------------------------------------------------------------
*/

async function collectStatistics(guild) {
  const staffStats =
    new Map();

  /*
   * Claims:
   *
   * Normal:123
   * Merch:123
   */

  const claims =
    new Map();

  /*
   * Reviews:
   *
   * Normal:123
   * Merch:123
   */

  const reviews =
    new Map();

  const sources = [
    {
      name: 'Normal',
      ticketLog:
        NORMAL.ticketLog,
      reviewLog:
        NORMAL.reviewLog,
    },

    {
      name: 'Merch',
      ticketLog:
        MERCH.ticketLog,
      reviewLog:
        MERCH.reviewLog,
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | READ CLAIM LOGS
  |--------------------------------------------------------------------------
  */

  for (
    const source of sources
  ) {
    const channel =
      guild.channels.cache.get(
        source.ticketLog
      ) ||
      await guild.channels
        .fetch(
          source.ticketLog
        )
        .catch(() => null);

    if (!channel) {
      console.error(
        `[Review Stats] Could not find ${source.name} ticket log ${source.ticketLog}`
      );

      continue;
    }

    if (
      !channel.isTextBased()
    ) {
      continue;
    }

    let messages;

    try {
      messages =
        await fetchAllMessages(
          channel
        );
    } catch (error) {
      console.error(
        `[Review Stats] Failed reading ${source.name} claim logs:`,
        error
      );

      continue;
    }

    console.log(
      `[Review Stats] ${source.name}: ${messages.length} ticket log messages`
    );

    for (
      const message of messages
    ) {
      if (
        !isClaimEvent(message)
      ) {
        continue;
      }

      const staffId =
        extractClaimedStaffId(
          message
        );

      if (!staffId) {
        console.warn(
          `[Review Stats] Claim event found but staff ID could not be detected. Message ${message.id}`
        );

        /*
         * Print the embed so the actual format
         * can be seen in Railway logs.
         */

        console.warn(
          '[Review Stats] Claim embed:',
          JSON.stringify(
            message.embeds?.[0]?.toJSON?.() ||
            message.embeds?.[0] ||
            {},
            null,
            2
          )
        );

        continue;
      }

      const ticketNumber =
        extractTicketNumber(
          message
        );

      const claimKey =
        ticketNumber
          ? `${source.name}:${ticketNumber}`
          : `${source.name}:message:${message.id}`;

      /*
       * Prevent duplicate claim logs.
       */

      if (
        claims.has(
          claimKey
        )
      ) {
        continue;
      }

      claims.set(
        claimKey,
        {
          staffId,
          ticketNumber,
          source:
            source.name,
          messageId:
            message.id,
        }
      );

      console.log(
        `[Review Stats] CLAIM FOUND | ${source.name} | Staff ${staffId} | Ticket ${ticketNumber || 'unknown'}`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | READ REVIEW LOGS
  |--------------------------------------------------------------------------
  */

  for (
    const source of sources
  ) {
    const channel =
      guild.channels.cache.get(
        source.reviewLog
      ) ||
      await guild.channels
        .fetch(
          source.reviewLog
        )
        .catch(() => null);

    if (!channel) {
      console.error(
        `[Review Stats] Could not find ${source.name} review log ${source.reviewLog}`
      );

      continue;
    }

    if (
      !channel.isTextBased()
    ) {
      continue;
    }

    let messages;

    try {
      messages =
        await fetchAllMessages(
          channel
        );
    } catch (error) {
      console.error(
        `[Review Stats] Failed reading ${source.name} review logs:`,
        error
      );

      continue;
    }

    console.log(
      `[Review Stats] ${source.name}: ${messages.length} review log messages`
    );

    for (
      const message of messages
    ) {
      if (
        !isReviewEvent(message)
      ) {
        continue;
      }

      const ticketNumber =
        extractTicketNumber(
          message
        );

      const rating =
        extractRating(
          message
        );

      if (
        !ticketNumber ||
        !rating
      ) {
        console.warn(
          `[Review Stats] Review found but ticket/rating missing. Message ${message.id}`
        );

        continue;
      }

      const key =
        `${source.name}:${ticketNumber}`;

      if (
        reviews.has(key)
      ) {
        continue;
      }

      reviews.set(
        key,
        {
          ticketNumber,
          rating,
          source:
            source.name,
        }
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | BUILD STAFF STATS
  |--------------------------------------------------------------------------
  */

  for (
    const claim of claims.values()
  ) {
    if (
      !staffStats.has(
        claim.staffId
      )
    ) {
      staffStats.set(
        claim.staffId,
        createStats(
          claim.staffId
        )
      );
    }

    const stats =
      staffStats.get(
        claim.staffId
      );

    /*
     * EVERY CLAIM EVENT COUNTS.
     */

    stats.claims++;

    /*
     * Match a review to this ticket.
     */

    if (
      claim.ticketNumber
    ) {
      const key =
        `${claim.source}:${claim.ticketNumber}`;

      const review =
        reviews.get(key);

      if (review) {
        stats.reviews++;

        stats.totalRating +=
          review.rating;

        stats.ratings[
          review.rating
        ]++;
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CALCULATE AVERAGES
  |--------------------------------------------------------------------------
  */

  for (
    const stats of
    staffStats.values()
  ) {
    stats.average =
      stats.reviews > 0
        ? stats.totalRating /
          stats.reviews
        : 0;
  }

  /*
  |--------------------------------------------------------------------------
  | DEBUG
  |--------------------------------------------------------------------------
  */

  console.log(
    '========================================'
  );

  console.log(
    `[Review Stats] TOTAL CLAIMS: ${claims.size}`
  );

  console.log(
    `[Review Stats] TOTAL REVIEWS: ${reviews.size}`
  );

  console.log(
    `[Review Stats] STAFF MEMBERS: ${staffStats.size}`
  );

  for (
    const stats of
    staffStats.values()
  ) {
    console.log(
      `[Review Stats] ${stats.userId}: ${stats.claims} claims | ${stats.reviews} reviews | ${stats.average.toFixed(2)}/5`
    );
  }

  console.log(
    '========================================'
  );

  return staffStats;
}
/*
|--------------------------------------------------------------------------
| DISPLAY HELPERS
|--------------------------------------------------------------------------
*/

function stars(value) {
  if (!value) {
    return '☆☆☆☆☆';
  }

  const rounded = Math.round(value);

  return (
    '⭐'.repeat(rounded) +
    '☆'.repeat(Math.max(0, 5 - rounded))
  );
}

function percentage(count, total) {
  if (!total) {
    return '0%';
  }

  return `${Math.round((count / total) * 100)}%`;
}

/*
|--------------------------------------------------------------------------
| LEADERBOARD
|--------------------------------------------------------------------------
*/

function buildLeaderboard(guild, stats, page) {
  const eligible = [...stats.values()]
    .filter(staff => staff.claims >= MIN_CLAIMS)
    .sort((a, b) => {
      // Highest rating first
      if (b.average !== a.average) {
        return b.average - a.average;
      }

      // Then most reviews
      if (b.reviews !== a.reviews) {
        return b.reviews - a.reviews;
      }

      // Then most claims
      return b.claims - a.claims;
    });

  const totalPages = Math.max(
    1,
    Math.ceil(eligible.length / PAGE_SIZE)
  );

  const safePage = Math.min(
    Math.max(page, 0),
    totalPages - 1
  );

  const start = safePage * PAGE_SIZE;

  const items = eligible.slice(
    start,
    start + PAGE_SIZE
  );

  const lines = [];

  if (!items.length) {
    lines.push(
      '❌ No staff members with **5+ claimed tickets** were found.'
    );
  }

  for (let i = 0; i < items.length; i++) {
    const staff = items[i];

    const position = start + i + 1;

    const member =
      guild.members.cache.get(staff.userId) ||
      awaitMember(guild, staff.userId);

    const mention = member
      ? member.toString()
      : `<@${staff.userId}>`;

    let medal = '';

    if (position === 1) {
      medal = '🥇 ';
    } else if (position === 2) {
      medal = '🥈 ';
    } else if (position === 3) {
      medal = '🥉 ';
    }

    const ratingText =
      staff.reviews > 0
        ? `${staff.average.toFixed(2)}/5`
        : 'No ratings';

    lines.push(
      `${medal}**#${position}** ${mention}\n` +
      `> ⭐ **${ratingText}** ${stars(staff.average)}\n` +
      `> 🎫 **${staff.claims}** claimed • 📝 **${staff.reviews}** reviews`
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0xF8D568)
    .setTitle('🏆 Staff Review Leaderboard')
    .setDescription(lines.join('\n\n'))
    .addFields({
      name: 'Leaderboard Requirement',
      value:
        `Only staff with **${MIN_CLAIMS}+ claimed tickets** appear.`,
    })
    .setFooter({
      text:
        `Page ${safePage + 1}/${totalPages} • Normal + Merch`,
    })
    .setTimestamp();

  return {
    embed,
    page: safePage,
    totalPages,
  };
}

function paginationRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('review_stats_previous')
      .setLabel('Previous')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),

    new ButtonBuilder()
      .setCustomId('review_stats_next')
      .setLabel('Next')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),

    new ButtonBuilder()
      .setCustomId('review_stats_close')
      .setLabel('Close')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger)
  );
}

/*
|--------------------------------------------------------------------------
| MEMBER HELPER
|--------------------------------------------------------------------------
*/

async function awaitMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

/*
|--------------------------------------------------------------------------
| INDIVIDUAL STAFF EMBED
|--------------------------------------------------------------------------
*/

function buildStaffEmbed(member, stats) {
  const total = stats.reviews;

  return new EmbedBuilder()
    .setColor(0xF8D568)
    .setTitle(
      `📊 Review Statistics — ${member.user.username}`
    )
    .setThumbnail(
      member.user.displayAvatarURL({
        size: 256,
      })
    )
    .addFields(
      {
        name: '🎫 Tickets Claimed',
        value: String(stats.claims),
        inline: true,
      },
      {
        name: '📝 Reviews',
        value: String(stats.reviews),
        inline: true,
      },
      {
        name: '⭐ Average Rating',
        value: stats.reviews
          ? `${stats.average.toFixed(2)}/5 ${stars(stats.average)}`
          : 'No ratings yet',
        inline: true,
      },
      {
        name: '⭐ 5 Stars',
        value: `${stats.ratings[5]} (${percentage(
          stats.ratings[5],
          total
        )})`,
        inline: true,
      },
      {
        name: '⭐ 4 Stars',
        value: `${stats.ratings[4]} (${percentage(
          stats.ratings[4],
          total
        )})`,
        inline: true,
      },
      {
        name: '⭐ 3 Stars',
        value: `${stats.ratings[3]} (${percentage(
          stats.ratings[3],
          total
        )})`,
        inline: true,
      },
      {
        name: '⭐ 2 Stars',
        value: `${stats.ratings[2]} (${percentage(
          stats.ratings[2],
          total
        )})`,
        inline: true,
      },
      {
        name: '⭐ 1 Star',
        value: `${stats.ratings[1]} (${percentage(
          stats.ratings[1],
          total
        )})`,
        inline: true,
      }
    )
    .setFooter({
      text: 'Normal + Merch tickets',
    })
    .setTimestamp();
}

/*
|--------------------------------------------------------------------------
| FILTER MENU
|--------------------------------------------------------------------------
*/

function buildFilterMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('review_stats_filter')
      .setPlaceholder('Choose a statistics view...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('All Staff')
          .setDescription(
            'View the staff leaderboard'
          )
          .setValue('all_staff')
          .setEmoji('🏆'),

        new StringSelectMenuOptionBuilder()
          .setLabel('One Staff Member')
          .setDescription(
            'View statistics for one staff member'
          )
          .setValue('one_staff')
          .setEmoji('👤')
      )
  );
}

/*
|--------------------------------------------------------------------------
| BACK / CLOSE ROW
|--------------------------------------------------------------------------
*/

function buildBackCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('review_stats_back')
      .setLabel('Back')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('review_stats_close')
      .setLabel('Close')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger)
  );
}

/*
|--------------------------------------------------------------------------
| STAFF SELECT MENU
|--------------------------------------------------------------------------
*/

function buildStaffSelectMenu() {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('review_stats_staff')
      .setPlaceholder(
        'Select a staff member...'
      )
  );
}

/*
|--------------------------------------------------------------------------
| MAIN COMMAND
|--------------------------------------------------------------------------
*/

export default {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription(
      'View staff review statistics.'
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageChannels
    )
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription(
          'View staff review statistics.'
        )
    ),

  async execute(interaction) {
    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageChannels
      )
    ) {
      return interaction.reply({
        content:
          '❌ You need **Manage Channels** permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    let stats;

    try {
      stats = await collectStatistics(
        interaction.guild
      );
    } catch (error) {
      console.error(
        '[Review Stats] Failed:',
        error
      );

      return interaction.editReply({
        content:
          '❌ Failed to read the ticket logs. Check that the bot has **View Channel** and **Read Message History** in the normal and merch log channels.',
      });
    }

    /*
    |--------------------------------------------------------------------------
    | INITIAL MENU
    |--------------------------------------------------------------------------
    */

    await interaction.editReply({
      content:
        '**📊 Review Statistics**\nChoose which statistics you want to view:',
      embeds: [],
      components: [
        buildFilterMenu(),
      ],
    });

    const message =
      await interaction.fetchReply();

    const collector =
      message.createMessageComponentCollector({
        time: 10 * 60 * 1000,
      });

    /*
    |--------------------------------------------------------------------------
    | COLLECTOR
    |--------------------------------------------------------------------------
    */

    collector.on(
      'collect',
      async component => {
        try {
          /*
          |--------------------------------------------------------------------------
          | ONLY THE ADMIN WHO OPENED IT
          |--------------------------------------------------------------------------
          */

          if (
            component.user.id !==
            interaction.user.id
          ) {
            return component.reply({
              content:
                '❌ Only the administrator who opened this menu can use it.',
              flags: MessageFlags.Ephemeral,
            });
          }

          /*
          |--------------------------------------------------------------------------
          | FILTER MENU
          |--------------------------------------------------------------------------
          */

          if (
            component.isStringSelectMenu() &&
            component.customId ===
              'review_stats_filter'
          ) {
            const selected =
              component.values[0];

            /*
            |--------------------------------------------------------------------------
            | ALL STAFF
            |--------------------------------------------------------------------------
            */

            if (
              selected ===
              'all_staff'
            ) {
              await component.deferUpdate();

              const result =
                buildLeaderboard(
                  interaction.guild,
                  stats,
                  0
                );

              await interaction.editReply({
                content: null,
                embeds: [
                  result.embed,
                ],
                components: [
                  paginationRow(
                    result.page,
                    result.totalPages
                  ),
                ],
              });

              return;
            }

            /*
            |--------------------------------------------------------------------------
            | ONE STAFF
            |--------------------------------------------------------------------------
            */

            if (
              selected ===
              'one_staff'
            ) {
              await component.update({
                content:
                  '**👤 Staff Statistics**\nSelect the staff member:',
                embeds: [],
                components: [
                  buildStaffSelectMenu(),
                ],
              });

              return;
            }
          }

          /*
          |--------------------------------------------------------------------------
          | STAFF SELECT
          |--------------------------------------------------------------------------
          */

          if (
            component.isUserSelectMenu() &&
            component.customId ===
              'review_stats_staff'
          ) {
            const userId =
              component.values[0];

            const member =
              interaction.guild.members.cache.get(
                userId
              ) ||
              await interaction.guild.members
                .fetch(userId)
                .catch(() => null);

            if (!member) {
              return component.update({
                content:
                  '❌ Member not found.',
                embeds: [],
                components: [
                  buildBackCloseRow(),
                ],
              });
            }

            const staff =
              stats.get(userId);

            /*
            |--------------------------------------------------------------------------
            | IMPORTANT FIX:
            | If the staff member exists in the stats map,
            | show their actual claim count.
            |--------------------------------------------------------------------------
            */

            if (!staff) {
              const emptyStats =
                createStats(userId);

              return component.update({
                content:
                  `❌ ${member} has **0 recorded claimed tickets**.\n\n` +
                  `This means the bot could not find any **Ticket Claimed** events for this staff member in the configured Normal or Merch ticket logs.`,
                embeds: [],
                components: [
                  buildBackCloseRow(),
                ],
              });
            }

            await component.update({
              content: null,
              embeds: [
                buildStaffEmbed(
                  member,
                  staff
                ),
              ],
              components: [
                buildBackCloseRow(),
              ],
            });

            return;
          }

          /*
          |--------------------------------------------------------------------------
          | BACK
          |--------------------------------------------------------------------------
          */

          if (
            component.isButton() &&
            component.customId ===
              'review_stats_back'
          ) {
            await component.update({
              content:
                '**📊 Review Statistics**\nChoose which statistics you want to view:',
              embeds: [],
              components: [
                buildFilterMenu(),
              ],
            });

            return;
          }

          /*
          |--------------------------------------------------------------------------
          | PAGINATION
          |--------------------------------------------------------------------------
          */

          if (
            component.isButton() &&
            (
              component.customId ===
                'review_stats_previous' ||
              component.customId ===
                'review_stats_next'
            )
          ) {
            const footer =
              component.message
                .embeds?.[0]
                ?.footer?.text || '';

            const match =
              footer.match(
                /Page\s+(\d+)\/(\d+)/
              );

            let page =
              match
                ? Number(match[1]) - 1
                : 0;

            if (
              component.customId ===
              'review_stats_previous'
            ) {
              page--;
            } else {
              page++;
            }

            const result =
              buildLeaderboard(
                interaction.guild,
                stats,
                page
              );

            await component.update({
              embeds: [
                result.embed,
              ],
              components: [
                paginationRow(
                  result.page,
                  result.totalPages
                ),
              ],
            });

            return;
          }

          /*
          |--------------------------------------------------------------------------
          | CLOSE
          |--------------------------------------------------------------------------
          */

          if (
            component.isButton() &&
            component.customId ===
              'review_stats_close'
          ) {
            await component.update({
              content:
                'Review statistics closed.',
              embeds: [],
              components: [],
            });

            collector.stop(
              'closed'
            );

            return;
          }
        } catch (error) {
          console.error(
            '[Review Stats] Component error:',
            error
          );

          if (
            !component.replied &&
            !component.deferred
          ) {
            await component.reply({
              content:
                '❌ Something went wrong while displaying the statistics.',
              flags:
                MessageFlags.Ephemeral,
            });
          }
        }
      }
    );

    /*
    |--------------------------------------------------------------------------
    | COLLECTOR END
    |--------------------------------------------------------------------------
    */

    collector.on(
      'end',
      async () => {
        try {
          /*
           * Don't overwrite the closed message.
           */

          if (
            collector.endReason ===
            'closed'
          ) {
            return;
          }

          await interaction.editReply({
            components: [],
          });
        } catch {
          // Interaction/message already expired.
        }
      }
    );
  },
};
/*
|--------------------------------------------------------------------------
| COLLECT STATISTICS
|--------------------------------------------------------------------------
*/

async function collectStatistics(guild) {
  const staffStats = new Map();

  /*
   * Claims are stored by:
   *
   * Normal:ticketNumber
   * Merch:ticketNumber
   *
   * This prevents duplicate claim log messages
   * from being counted twice.
   */

  const claims = new Map();

  /*
   * Reviews are stored by:
   *
   * Normal:ticketNumber
   * Merch:ticketNumber
   */

  const reviews = new Map();

  const sources = [
    {
      name: 'Normal',
      ticketLog: NORMAL.ticketLog,
      reviewLog: NORMAL.reviewLog,
    },
    {
      name: 'Merch',
      ticketLog: MERCH.ticketLog,
      reviewLog: MERCH.reviewLog,
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | READ CLAIM LOGS
  |--------------------------------------------------------------------------
  */

  for (const source of sources) {
    let channel =
      guild.channels.cache.get(
        source.ticketLog
      );

    if (!channel) {
      channel =
        await guild.channels
          .fetch(source.ticketLog)
          .catch(() => null);
    }

    if (!channel) {
      console.error(
        `[Review Stats] Could not find ${source.name} ticket log: ${source.ticketLog}`
      );
      continue;
    }

    if (!channel.isTextBased()) {
      console.error(
        `[Review Stats] ${source.name} ticket log is not text based.`
      );
      continue;
    }

    let messages;

    try {
      messages =
        await fetchAllMessages(channel);
    } catch (error) {
      console.error(
        `[Review Stats] Failed reading ${source.name} claim logs:`,
        error
      );
      continue;
    }

    console.log(
      `[Review Stats] ${source.name} claim log: ${messages.length} messages`
    );

    for (const message of messages) {
      if (!message.embeds?.length) {
        continue;
      }

      const embed =
        message.embeds[0];

      const title =
        String(
          embed.title || ''
        )
          .trim()
          .toLowerCase();

      /*
       * Only count actual claim events.
       *
       * Do NOT count:
       * - Ticket Opened
       * - Ticket Closed
       * - Ticket Unclaimed
       * - Ticket Priority
       */

      if (
        title !== 'ticket claimed'
      ) {
        continue;
      }

      /*
       * Find the staff member who claimed it.
       */

      let staffId =
        extractClaimedStaffId(
          message
        );

      /*
       * Some versions of the logging
       * system may use "Executor" instead
       * of "Claimed By".
       */

      if (!staffId) {
        const executorField =
          getField(
            embed,
            'Executor'
          );

        if (executorField) {
          staffId =
            extractUserId(
              executorField
            );
        }
      }

      /*
       * Another fallback for older logs.
       */

      if (!staffId) {
        for (
          const field
          of embed.fields || []
        ) {
          const fieldName =
            String(
              field.name || ''
            )
              .toLowerCase();

          if (
            fieldName.includes(
              'executor'
            ) ||
            fieldName.includes(
              'staff'
            )
          ) {
            const found =
              extractUserId(
                field.value
              );

            if (found) {
              staffId = found;
              break;
            }
          }
        }
      }

      if (!staffId) {
        console.warn(
          `[Review Stats] Ticket Claimed found but staff member could not be identified. Message ${message.id}`
        );
        continue;
      }

      /*
       * Get ticket number.
       */

      const ticketNumber =
        extractTicketNumber(
          message
        );

      /*
       * IMPORTANT:
       *
       * If the ticket number cannot be found,
       * still count the claim.
       *
       * This fixes older claim logs where the
       * ticket field may be missing.
       */

      const claimKey =
        ticketNumber
          ? `${source.name}:${ticketNumber}`
          : `${source.name}:message:${message.id}`;

      /*
       * Prevent duplicate claim events.
       */

      if (
        claims.has(
          claimKey
        )
      ) {
        continue;
      }

      claims.set(
        claimKey,
        {
          staffId,
          ticketNumber,
          source:
            source.name,
          messageId:
            message.id,
        }
      );

      console.log(
        `[Review Stats] Claim counted: ${source.name} | Staff ${staffId} | Ticket ${ticketNumber || 'unknown'}`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | READ REVIEW LOGS
  |--------------------------------------------------------------------------
  */

  for (const source of sources) {
    let channel =
      guild.channels.cache.get(
        source.reviewLog
      );

    if (!channel) {
      channel =
        await guild.channels
          .fetch(source.reviewLog)
          .catch(() => null);
    }

    if (!channel) {
      console.error(
        `[Review Stats] Could not find ${source.name} review log: ${source.reviewLog}`
      );
      continue;
    }

    if (!channel.isTextBased()) {
      continue;
    }

    let messages;

    try {
      messages =
        await fetchAllMessages(channel);
    } catch (error) {
      console.error(
        `[Review Stats] Failed reading ${source.name} review logs:`,
        error
      );
      continue;
    }

    console.log(
      `[Review Stats] ${source.name} review log: ${messages.length} messages`
    );

    for (const message of messages) {
      if (!message.embeds?.length) {
        continue;
      }

      const embed =
        message.embeds[0];

      const title =
        String(
          embed.title || ''
        )
          .trim()
          .toLowerCase();

      /*
       * Accept both formats that the bot
       * has used for feedback logs.
       */

      if (
        title !==
          '⭐ feedback received' &&
        title !==
          'feedback received' &&
        !title.includes(
          'feedback received'
        )
      ) {
        continue;
      }

      const ticketNumber =
        extractTicketNumber(
          message
        );

      const rating =
        extractRating(
          message
        );

      if (
        !ticketNumber ||
        !rating
      ) {
        console.warn(
          `[Review Stats] Feedback found but ticket number/rating could not be read. Message ${message.id}`
        );
        continue;
      }

      const reviewKey =
        `${source.name}:${ticketNumber}`;

      /*
       * Only one rating per ticket.
       */

      if (
        reviews.has(
          reviewKey
        )
      ) {
        continue;
      }

      reviews.set(
        reviewKey,
        {
          ticketNumber,
          rating,
          source:
            source.name,
          messageId:
            message.id,
        }
      );

      console.log(
        `[Review Stats] Review counted: ${source.name} | Ticket ${ticketNumber} | Rating ${rating}/5`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | BUILD STAFF STATISTICS
  |--------------------------------------------------------------------------
  */

  for (
    const claim
    of claims.values()
  ) {
    if (
      !staffStats.has(
        claim.staffId
      )
    ) {
      staffStats.set(
        claim.staffId,
        createStats(
          claim.staffId
        )
      );
    }

    const stats =
      staffStats.get(
        claim.staffId
      );

    /*
     * EVERY valid Ticket Claimed event
     * counts as one claimed ticket.
     */

    stats.claims++;

    /*
     * If the claim has a ticket number,
     * try to find its review.
     */

    if (
      claim.ticketNumber
    ) {
      const reviewKey =
        `${claim.source}:${claim.ticketNumber}`;

      const review =
        reviews.get(
          reviewKey
        );

      if (review) {
        stats.reviews++;

        stats.totalRating +=
          review.rating;

        stats.ratings[
          review.rating
        ]++;
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CALCULATE AVERAGES
  |--------------------------------------------------------------------------
  */

  for (
    const stats
    of staffStats.values()
  ) {
    if (
      stats.reviews > 0
    ) {
      stats.average =
        stats.totalRating /
        stats.reviews;
    } else {
      stats.average = 0;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | DEBUG
  |--------------------------------------------------------------------------
  */

  console.log(
    '========================================'
  );

  console.log(
    `[Review Stats] CLAIM EVENTS: ${claims.size}`
  );

  console.log(
    `[Review Stats] REVIEWS: ${reviews.size}`
  );

  console.log(
    `[Review Stats] STAFF: ${staffStats.size}`
  );

  for (
    const stats
    of staffStats.values()
  ) {
    console.log(
      `[Review Stats] ${stats.userId} | Claims: ${stats.claims} | Reviews: ${stats.reviews} | Average: ${stats.average.toFixed(2)}/5`
    );
  }

  console.log(
    '========================================'
  );

  return staffStats;
}

/*
|--------------------------------------------------------------------------
| FETCH ALL MESSAGES
|--------------------------------------------------------------------------
*/

async function fetchAllMessages(channel) {
  const messages = [];

  let before = null;

  while (true) {
    const batch =
      await channel.messages.fetch({
        limit: 100,
        ...(before
          ? {
              before,
            }
          : {}),
      });

    if (!batch.size) {
      break;
    }

    messages.push(
      ...batch.values()
    );

    if (
      batch.size < 100
    ) {
      break;
    }

    const oldest =
      batch.last();

    if (!oldest?.id) {
      break;
    }

    before =
      oldest.id;
  }

  return messages;
}

/*
|--------------------------------------------------------------------------
| STAT STRUCTURE
|--------------------------------------------------------------------------
*/

function createStats(userId) {
  return {
    userId,

    /*
     * Number of tickets this staff member
     * actually claimed.
     */

    claims: 0,

    /*
     * Number of those tickets which received
     * a review.
     */

    reviews: 0,

    /*
     * Total rating points.
     */

    totalRating: 0,

    /*
     * Calculated average.
     */

    average: 0,

    /*
     * Individual rating counts.
     */

    ratings: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    },
  };
}

/*
|--------------------------------------------------------------------------
| TICKET NUMBER EXTRACTION
|--------------------------------------------------------------------------
*/

function extractTicketNumber(message) {
  const embed =
    message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * First try a dedicated Ticket field.
   */

  const ticketField =
    getField(
      embed,
      'Ticket'
    );

  if (ticketField) {
    const match =
      String(
        ticketField
      ).match(
        /#?(\d+)/
      );

    if (match) {
      return match[1];
    }
  }

  /*
   * Check every field for Ticket/Number/ID.
   */

  for (
    const field
    of embed.fields || []
  ) {
    const name =
      String(
        field.name || ''
      )
        .toLowerCase();

    if (
      name.includes('ticket') ||
      name.includes('number') ||
      name.includes('ticket id')
    ) {
      const match =
        String(
          field.value || ''
        ).match(
          /#?(\d+)/
        );

      if (match) {
        return match[1];
      }
    }
  }

  /*
   * Finally inspect all embed text.
   */

  const text =
    getEmbedText(embed);

  const match =
    text.match(
      /ticket(?:\s*(?:number|id))?\s*#?\s*(\d+)/i
    );

  return (
    match?.[1] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| STAFF EXTRACTION
|--------------------------------------------------------------------------
*/

function extractClaimedStaffId(message) {
  const embed =
    message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * Normal format:
   *
   * Claimed by
   * @Staff
   */

  const claimedBy =
    getField(
      embed,
      'Claimed by'
    );

  if (claimedBy) {
    const id =
      extractUserId(
        claimedBy
      );

    if (id) {
      return id;
    }
  }

  /*
   * Try variations.
   */

  for (
    const field
    of embed.fields || []
  ) {
    const name =
      String(
        field.name || ''
      )
        .toLowerCase();

    if (
      name.includes(
        'claimed by'
      ) ||
      name.includes(
        'claimer'
      ) ||
      name === 'claimed' ||
      name.includes(
        'staff'
      )
    ) {
      const id =
        extractUserId(
          field.value
        );

      if (id) {
        return id;
      }
    }
  }

  /*
   * Search entire embed text.
   */

  const text =
    getEmbedText(embed);

  const patterns = [
    /claimed\s+by\s*[:\-]?\s*<@!?(\d{17,20})>/i,
    /claimed\s*[:\-]?\s*<@!?(\d{17,20})>/i,
    /staff\s*[:\-]?\s*<@!?(\d{17,20})>/i,
  ];

  for (
    const pattern
    of patterns
  ) {
    const match =
      text.match(
        pattern
      );

    if (match) {
      return match[1];
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| RATING EXTRACTION
|--------------------------------------------------------------------------
*/

function extractRating(message) {
  const embed =
    message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * Try Rating field first.
   */

  const ratingField =
    getField(
      embed,
      'Rating'
    );

  if (ratingField) {
    const value =
      String(
        ratingField
      );

    /*
     * Count stars.
     */

    const starCount =
      (
        value.match(
          /⭐/g
        ) || []
      ).length;

    if (
      starCount >= 1 &&
      starCount <= 5
    ) {
      return starCount;
    }

    /*
     * Numeric rating.
     */

    const numeric =
      value.match(
        /\b([1-5])(?:\s*\/\s*5)?\b/
      );

    if (numeric) {
      return Number(
        numeric[1]
      );
    }
  }

  /*
   * Search all embed text.
   */

  const text =
    getEmbedText(embed);

  const numeric =
    text.match(
      /rating\s*[:\-]?\s*([1-5])(?:\s*\/\s*5)?/i
    );

  if (numeric) {
    return Number(
      numeric[1]
    );
  }

  /*
   * Search for star rating.
   */

  const starsFound =
    (
      text.match(
        /⭐/g
      ) || []
    ).length;

  if (
    starsFound >= 1 &&
    starsFound <= 5
  ) {
    return starsFound;
  }

  return null;
}
