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

function getField(embed, name) {
  if (!embed) return null;

  const target = String(name)
    .toLowerCase()
    .trim();

  const field = (embed.fields || []).find(
    f =>
      String(f.name || '')
        .toLowerCase()
        .trim() === target
  );

  return field?.value || null;
}

function extractUserId(value) {
  if (!value) return null;

  const text = String(value);

  const mention = text.match(
    /<@!?(\d{17,20})>/
  );

  if (mention) {
    return mention[1];
  }

  const id = text.match(
    /\b\d{17,20}\b/
  );

  return id?.[0] || null;
}

/*
|--------------------------------------------------------------------------
| TICKET NUMBER
|--------------------------------------------------------------------------
*/

function extractTicketNumber(message) {
  const embed = message?.embeds?.[0];

  if (!embed) return null;

  /*
   * First: Ticket field.
   */

  const ticketField =
    getField(embed, 'Ticket');

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
   * Other possible field names.
   */

  for (const field of embed.fields || []) {
    const fieldName =
      String(field.name || '')
        .toLowerCase();

    if (
      fieldName.includes('ticket') ||
      fieldName.includes('number') ||
      fieldName.includes('ticket id')
    ) {
      const match =
        String(field.value || '').match(
          /#?\s*(\d+)/
        );

      if (match) {
        return match[1];
      }
    }
  }

  /*
   * Search entire embed.
   */

  const text =
    getEmbedText(embed);

  const patterns = [
    /ticket(?:\s*(?:number|id))?\s*#?\s*(\d+)/i,
    /ticket\s*[:\-]\s*#?\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
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
| CLAIMED STAFF
|--------------------------------------------------------------------------
*/

function extractClaimedStaffId(message) {
  const embed = message?.embeds?.[0];

  if (!embed) return null;

  /*
   * Preferred:
   *
   * Claimed By
   * @User
   */

  const claimedBy =
    getField(embed, 'Claimed By');

  if (claimedBy) {
    const id =
      extractUserId(claimedBy);

    if (id) {
      return id;
    }
  }

  /*
   * Variations used by older logs.
   */

  for (const field of embed.fields || []) {
    const name =
      String(field.name || '')
        .toLowerCase()
        .trim();

    if (
      name === 'claimed by' ||
      name.includes('claimed by') ||
      name.includes('claimer') ||
      name === 'claimed' ||
      name.includes('staff')
    ) {
      const id =
        extractUserId(field.value);

      if (id) {
        return id;
      }
    }
  }

  /*
   * Search entire embed.
   */

  const text =
    getEmbedText(embed);

  const patterns = [
    /claimed\s+by\s*[:\-]?\s*<@!?(\d{17,20})>/i,
    /claimed\s*[:\-]?\s*<@!?(\d{17,20})>/i,
    /staff\s*[:\-]?\s*<@!?(\d{17,20})>/i,
  ];

  for (const pattern of patterns) {
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
  const embed = message?.embeds?.[0];

  if (!embed) return null;

  /*
   * Rating field.
   */

  const ratingField =
    getField(embed, 'Rating');

  if (ratingField) {
    const value =
      String(ratingField);

    const stars =
      (value.match(/⭐/g) || []).length;

    if (stars >= 1 && stars <= 5) {
      return stars;
    }

    const numeric =
      value.match(
        /\b([1-5])(?:\s*\/\s*5)?\b/
      );

    if (numeric) {
      return Number(numeric[1]);
    }
  }

  /*
   * Search entire embed.
   */

  const text =
    getEmbedText(embed);

  const numeric =
    text.match(
      /rating\s*[:\-]?\s*([1-5])(?:\s*\/\s*5)?/i
    );

  if (numeric) {
    return Number(numeric[1]);
  }

  const stars =
    (text.match(/⭐/g) || []).length;

  if (stars >= 1 && stars <= 5) {
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
| STATS OBJECT
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
| COLLECT STATISTICS
|--------------------------------------------------------------------------
*/

async function collectStatistics(guild) {
  const staffStats = new Map();

  /*
   * Claims:
   *
   * Normal:123
   * Merch:123
   */

  const claims = new Map();

  /*
   * Reviews:
   *
   * Normal:123
   * Merch:123
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
  | CLAIM LOGS
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
        `[Review Stats] Cannot find ${source.name} ticket log ${source.ticketLog}`
      );
      continue;
    }

    if (!channel.isTextBased()) {
      console.error(
        `[Review Stats] ${source.name} ticket log is not text based`
      );
      continue;
    }

    let messages;

    try {
      messages =
        await fetchAllMessages(channel);
    } catch (error) {
      console.error(
        `[Review Stats] Failed to read ${source.name} ticket log:`,
        error
      );
      continue;
    }

    console.log(
      `[Review Stats] ${source.name} ticket log: ${messages.length} messages`
    );

    for (const message of messages) {
      const embed =
        message.embeds?.[0];

      if (!embed) {
        continue;
      }

      const title =
        String(embed.title || '')
          .trim()
          .toLowerCase();

      /*
       * ONLY actual claims.
       */

      if (title !== 'ticket claimed') {
        continue;
      }

      const staffId =
        extractClaimedStaffId(message);

      if (!staffId) {
        console.warn(
          `[Review Stats] Claim found but staff ID could not be extracted. Message ${message.id}`
        );
        continue;
      }

      const ticketNumber =
        extractTicketNumber(message);

      /*
       * IMPORTANT:
       *
       * Even if ticket number is missing,
       * the claim is STILL counted.
       */

      const claimKey =
        ticketNumber
          ? `${source.name}:${ticketNumber}`
          : `${source.name}:message:${message.id}`;

      /*
       * Prevent duplicate counting.
       */

      if (claims.has(claimKey)) {
        continue;
      }

      claims.set(
        claimKey,
        {
          staffId,
          ticketNumber,
          source: source.name,
          messageId: message.id,
        }
      );

      console.log(
        `[Review Stats] CLAIM +1 | ${source.name} | Staff ${staffId} | Ticket ${ticketNumber || 'unknown'}`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | REVIEW LOGS
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
        `[Review Stats] Cannot find ${source.name} review log ${source.reviewLog}`
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
        `[Review Stats] Failed to read ${source.name} review log:`,
        error
      );
      continue;
    }

    console.log(
      `[Review Stats] ${source.name} review log: ${messages.length} messages`
    );

    for (const message of messages) {
      const embed =
        message.embeds?.[0];

      if (!embed) {
        continue;
      }

      const title =
        String(embed.title || '')
          .trim()
          .toLowerCase();

      /*
       * Accept the current and older
       * feedback embed titles.
       */

      if (
        title !== 'feedback received' &&
        title !== '⭐ feedback received' &&
        !title.includes('feedback received')
      ) {
        continue;
      }

      const ticketNumber =
        extractTicketNumber(message);

      const rating =
        extractRating(message);

      if (!ticketNumber || !rating) {
        console.warn(
          `[Review Stats] Review found but ticket/rating could not be extracted. Message ${message.id}`
        );
        continue;
      }

      const reviewKey =
        `${source.name}:${ticketNumber}`;

      if (reviews.has(reviewKey)) {
        continue;
      }

      reviews.set(
        reviewKey,
        {
          ticketNumber,
          rating,
          source: source.name,
          messageId: message.id,
        }
      );

      console.log(
        `[Review Stats] REVIEW | ${source.name} | Ticket ${ticketNumber} | ${rating}/5`
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | BUILD STAFF STATS
  |--------------------------------------------------------------------------
  */

  for (const claim of claims.values()) {
    if (!staffStats.has(claim.staffId)) {
      staffStats.set(
        claim.staffId,
        createStats(claim.staffId)
      );
    }

    const stats =
      staffStats.get(
        claim.staffId
      );

    /*
     * Every claim = +1.
     */

    stats.claims++;

    /*
     * Match review to ticket.
     */

    if (claim.ticketNumber) {
      const reviewKey =
        `${claim.source}:${claim.ticketNumber}`;

      const review =
        reviews.get(reviewKey);

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
  | AVERAGES
  |--------------------------------------------------------------------------
  */

  for (const stats of staffStats.values()) {
    if (stats.reviews > 0) {
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
    `[Review Stats] TOTAL CLAIMS: ${claims.size}`
  );

  console.log(
    `[Review Stats] TOTAL REVIEWS: ${reviews.size}`
  );

  console.log(
    `[Review Stats] STAFF MEMBERS: ${staffStats.size}`
  );

  for (const stats of staffStats.values()) {
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

  const rounded =
    Math.round(value);

  return (
    '⭐'.repeat(rounded) +
    '☆'.repeat(
      Math.max(
        0,
        5 - rounded
      )
    )
  );
}

function percentage(count, total) {
  if (!total) {
    return '0%';
  }

  return `${Math.round(
    (count / total) * 100
  )}%`;
}

/*
|--------------------------------------------------------------------------
| LEADERBOARD
|--------------------------------------------------------------------------
*/

function buildLeaderboard(
  guild,
  stats,
  page
) {
  const eligible =
    [...stats.values()]
      .filter(
        staff =>
          staff.claims >= MIN_CLAIMS
      )
      .sort(
        (a, b) => {
          /*
           * Rating first.
           */

          if (
            b.average !==
            a.average
          ) {
            return (
              b.average -
              a.average
            );
          }

          /*
           * Reviews second.
           */

          if (
            b.reviews !==
            a.reviews
          ) {
            return (
              b.reviews -
              a.reviews
            );
          }

          /*
           * Claims third.
           */

          return (
            b.claims -
            a.claims
          );
        }
      );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        eligible.length /
          PAGE_SIZE
      )
    );

  const safePage =
    Math.min(
      Math.max(
        page,
        0
      ),
      totalPages - 1
    );

  const start =
    safePage *
    PAGE_SIZE;

  const items =
    eligible.slice(
      start,
      start + PAGE_SIZE
    );

  const lines = [];

  if (!items.length) {
    lines.push(
      '❌ No staff members with **5+ claimed tickets** were found.'
    );
  }

  for (
    let i = 0;
    i < items.length;
    i++
  ) {
    const staff =
      items[i];

    const position =
      start + i + 1;

    const member =
      guild.members.cache.get(
        staff.userId
      );

    const mention =
      member
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
      `> ⭐ **${ratingText}** ${stars(
        staff.average
      )}\n` +
      `> 🎫 **${staff.claims}** claimed • 📝 **${staff.reviews}** reviews`
    );
  }

  const embed =
    new EmbedBuilder()
      .setColor(0xF8D568)
      .setTitle(
        '🏆 Staff Review Leaderboard'
      )
      .setDescription(
        lines.join('\n\n')
      )
      .addFields({
        name:
          'Leaderboard Requirement',
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

/*
|--------------------------------------------------------------------------
| PAGINATION
|--------------------------------------------------------------------------
*/

function paginationRow(
  page,
  totalPages
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'review_stats_previous'
        )
        .setLabel('Previous')
        .setEmoji('⬅️')
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          page <= 0
        ),

      new ButtonBuilder()
        .setCustomId(
          'review_stats_next'
        )
        .setLabel('Next')
        .setEmoji('➡️')
        .setStyle(
          ButtonStyle.Secondary
        )
        .setDisabled(
          page >=
          totalPages - 1
        ),

      new ButtonBuilder()
        .setCustomId(
          'review_stats_close'
        )
        .setLabel('Close')
        .setEmoji('✖️')
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

/*
|--------------------------------------------------------------------------
| STAFF EMBED
|--------------------------------------------------------------------------
*/

function buildStaffEmbed(
  member,
  stats
) {
  const total =
    stats.reviews;

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
        name:
          '🎫 Tickets Claimed',
        value:
          String(
            stats.claims
          ),
        inline: true,
      },
      {
        name:
          '📝 Reviews',
        value:
          String(
            stats.reviews
          ),
        inline: true,
      },
      {
        name:
          '⭐ Average Rating',
        value:
          stats.reviews
            ? `${stats.average.toFixed(
                2
              )}/5 ${stars(
                stats.average
              )}`
            : 'No ratings yet',
        inline: true,
      },
      {
        name:
          '⭐ 5 Stars',
        value:
          `${stats.ratings[5]} (${percentage(
            stats.ratings[5],
            total
          )})`,
        inline: true,
      },
      {
        name:
          '⭐ 4 Stars',
        value:
          `${stats.ratings[4]} (${percentage(
            stats.ratings[4],
            total
          )})`,
        inline: true,
      },
      {
        name:
          '⭐ 3 Stars',
        value:
          `${stats.ratings[3]} (${percentage(
            stats.ratings[3],
            total
          )})`,
        inline: true,
      },
      {
        name:
          '⭐ 2 Stars',
        value:
          `${stats.ratings[2]} (${percentage(
            stats.ratings[2],
            total
          )})`,
        inline: true,
      },
      {
        name:
          '⭐ 1 Star',
        value:
          `${stats.ratings[1]} (${percentage(
            stats.ratings[1],
            total
          )})`,
        inline: true,
      }
    )
    .setFooter({
      text:
        'Normal + Merch tickets',
    })
    .setTimestamp();
}

/*
|--------------------------------------------------------------------------
| FILTER MENU
|--------------------------------------------------------------------------
*/

function buildFilterMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          'review_stats_filter'
        )
        .setPlaceholder(
          'Choose a statistics view...'
        )
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(
              'All Staff'
            )
            .setDescription(
              'View the staff leaderboard'
            )
            .setValue(
              'all_staff'
            )
            .setEmoji('🏆'),

          new StringSelectMenuOptionBuilder()
            .setLabel(
              'One Staff Member'
            )
            .setDescription(
              'View statistics for one staff member'
            )
            .setValue(
              'one_staff'
            )
            .setEmoji('👤')
        )
    );
}

/*
|--------------------------------------------------------------------------
| STAFF SELECT
|--------------------------------------------------------------------------
*/

function buildStaffSelectMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(
          'review_stats_staff'
        )
        .setPlaceholder(
          'Select a staff member...'
        )
    );
}

/*
|--------------------------------------------------------------------------
| BACK + CLOSE
|--------------------------------------------------------------------------
*/

function buildBackCloseRow() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          'review_stats_back'
        )
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          'review_stats_close'
        )
        .setLabel('Close')
        .setEmoji('✖️')
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

/*
|--------------------------------------------------------------------------
| COMMAND
|--------------------------------------------------------------------------
*/

export default {
  data:
    new SlashCommandBuilder()
      .setName('review')
      .setDescription(
        'View staff review statistics.'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageChannels
      )
      .addSubcommand(
        sub =>
          sub
            .setName('stats')
            .setDescription(
              'View staff review statistics.'
            )
      ),

  async execute(interaction) {
    /*
     * Permission check.
     */

    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageChannels
      )
    ) {
      return interaction.reply({
        content:
          '❌ You need **Manage Channels** permission to use this command.',
        flags:
          MessageFlags.Ephemeral,
      });
    }

    /*
     * Defer.
     */

    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral,
    });

    /*
     * Load statistics.
     */

    let stats;

    try {
      stats =
        await collectStatistics(
          interaction.guild
        );
    } catch (error) {
      console.error(
        '[Review Stats] Failed:',
        error
      );

      return interaction.editReply({
        content:
          '❌ Failed to read the ticket logs. Make sure the bot has **View Channel** and **Read Message History** in both the Normal and Merch log channels.',
        embeds: [],
        components: [],
      });
    }

    /*
     * Initial menu.
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

    /*
     * Component collector.
     */

    const collector =
      message.createMessageComponentCollector({
        time:
          10 * 60 * 1000,
      });

    collector.on(
      'collect',
      async component => {
        try {
          /*
           * Only command user can interact.
           */

          if (
            component.user.id !==
            interaction.user.id
          ) {
            return component.reply({
              content:
                '❌ Only the administrator who opened this menu can use it.',
              flags:
                MessageFlags.Ephemeral,
            });
          }

          /*
          |--------------------------------------------------------------------------
          | FILTER
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
             * ALL STAFF
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
             * ONE STAFF
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
             * No claims found.
             */

            if (!staff) {
              return component.update({
                content:
                  `❌ ${member} has **0 recorded claimed tickets**.\n\n` +
                  'The bot could not find a **Ticket Claimed** event for this member in the configured Normal or Merch ticket logs.',
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
     * Remove components when collector expires.
     */

    collector.on(
      'end',
      async (_, reason) => {
        if (
          reason === 'closed'
        ) {
          return;
        }

        try {
          await interaction.editReply({
            components: [],
          });
        } catch {
          // Already expired/deleted.
        }
      }
    );
  },
};
