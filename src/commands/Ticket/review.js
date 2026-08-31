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
| EMBED HELPERS
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
    embed.author?.name,
    embed.footer?.text,
  ]
    .filter(Boolean)
    .join(' ');
}

function getField(embed, fieldName) {
  if (!embed?.fields) return null;

  const wanted = String(fieldName)
    .toLowerCase()
    .trim();

  const field = embed.fields.find(field => {
    return String(field.name || '')
      .toLowerCase()
      .trim() === wanted;
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

  /*
   * Discord mention:
   * <@123>
   * <@!123>
   */

  const mention = text.match(
    /<@!?(\d{17,20})>/
  );

  if (mention) {
    return mention[1];
  }

  /*
   * Raw Discord ID.
   */

  const raw = text.match(
    /\b(\d{17,20})\b/
  );

  if (raw) {
    return raw[1];
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| CLAIMED STAFF
|--------------------------------------------------------------------------
|
| ticketLogging.js creates:
|
| Claimed by
| <@STAFF_ID>
|
| We intentionally check several places because old logs
| may have slightly different formats.
|--------------------------------------------------------------------------
*/

function extractClaimedStaffId(message) {
  const embed = message?.embeds?.[0];

  if (!embed) return null;

  /*
   * Exact current field.
   */

  const claimedBy = getField(
    embed,
    'Claimed by'
  );

  if (claimedBy) {
    const id = extractUserId(
      claimedBy
    );

    if (id) {
      return id;
    }
  }

  /*
   * Older / alternate field names.
   */

  for (const field of embed.fields || []) {
    const name = String(
      field.name || ''
    ).toLowerCase();

    if (
      name.includes('claimed by') ||
      name.includes('claimed') ||
      name.includes('claimer')
    ) {
      const id = extractUserId(
        field.value
      );

      if (id) {
        return id;
      }
    }
  }

  /*
   * Search the complete embed.
   */

  const text = getEmbedText(
    embed
  );

  const claimedMatch = text.match(
    /claimed\s+by[\s:：-]*<@!?(\d{17,20})>/i
  );

  if (claimedMatch) {
    return claimedMatch[1];
  }

  /*
   * Last fallback: find a mention after "claimed".
   */

  const fallback = text.match(
    /claimed[\s\S]{0,100}<@!?(\d{17,20})>/i
  );

  if (fallback) {
    return fallback[1];
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| TICKET NUMBER
|--------------------------------------------------------------------------
*/

function extractTicketNumber(message) {
  const embed = message?.embeds?.[0];

  if (!embed) return null;

  const ticketField = getField(
    embed,
    'Ticket'
  );

  if (ticketField) {
    const match = String(
      ticketField
    ).match(
      /#?(\d{1,10})\b/
    );

    if (match) {
      return match[1];
    }
  }

  /*
   * Check other ticket-related fields.
   */

  for (const field of embed.fields || []) {
    const name = String(
      field.name || ''
    ).toLowerCase();

    if (
      name.includes('ticket') ||
      name.includes('ticket number') ||
      name.includes('ticket id')
    ) {
      const value = String(
        field.value || ''
      );

      /*
       * Don't accidentally use a Discord
       * channel ID as a ticket number.
       */

      const match = value.match(
        /#(\d{1,10})\b/
      );

      if (match) {
        return match[1];
      }

      const simple = value.match(
        /\b(\d{1,10})\b/
      );

      if (simple) {
        return simple[1];
      }
    }
  }

  /*
   * Search title/description.
   */

  const text = getEmbedText(
    embed
  );

  const match = text.match(
    /ticket(?:\s*(?:number|no|id))?\s*#?\s*(\d{1,10})\b/i
  );

  return match?.[1] || null;
}

/*
|--------------------------------------------------------------------------
| RATING
|--------------------------------------------------------------------------
*/

function extractRating(message) {
  const embed = message?.embeds?.[0];

  if (!embed) return null;

  const ratingField = getField(
    embed,
    'Rating'
  );

  if (ratingField) {
    const stars = (
      String(ratingField).match(
        /⭐/g
      ) || []
    ).length;

    if (
      stars >= 1 &&
      stars <= 5
    ) {
      return stars;
    }

    const numeric = String(
      ratingField
    ).match(
      /\b([1-5])(?:\s*\/\s*5)?\b/
    );

    if (numeric) {
      return Number(
        numeric[1]
      );
    }
  }

  const text = getEmbedText(
    embed
  );

  const numeric = text.match(
    /rating\s*[:\-]?\s*([1-5])(?:\s*\/\s*5)?/i
  );

  if (numeric) {
    return Number(
      numeric[1]
    );
  }

  const stars = (
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

  let before;

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
| STAFF STATS
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
| DETECT CLAIM EVENT
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| We do NOT require the title to be exactly
| "Ticket Claimed".
|
| This supports:
|
| Ticket Claimed
| 🎫 Ticket Claimed
| Ticket claimed
| etc.
|
| But "Ticket Unclaimed" is explicitly ignored.
|--------------------------------------------------------------------------
*/

function isClaimLog(message) {
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
   * Never count unclaim logs.
   */

  if (
    title.includes('unclaim')
  ) {
    return false;
  }

  /*
   * Title contains "claim".
   */

  if (
    title.includes('claim')
  ) {
    return true;
  }

  /*
   * Even if the title changed,
   * the current logger has a
   * "Claimed by" field.
   */

  const claimedBy =
    getField(
      embed,
      'Claimed by'
    );

  if (claimedBy) {
    return Boolean(
      extractUserId(
        claimedBy
      )
    );
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

  const claims =
    new Map();

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
          .fetch(
            source.ticketLog
          )
          .catch(() => null);
    }

    if (!channel) {
      console.error(
        `[Review Stats] ${source.name} ticket log channel not found: ${source.ticketLog}`
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
        await fetchAllMessages(
          channel
        );
    } catch (error) {
      console.error(
        `[Review Stats] Failed reading ${source.name} ticket logs:`,
        error
      );

      continue;
    }

    console.log(
      `[Review Stats] ${source.name} ticket log: ${messages.length} messages`
    );

    let claimCount = 0;

    for (const message of messages) {
      if (
        !isClaimLog(
          message
        )
      ) {
        continue;
      }

      const staffId =
        extractClaimedStaffId(
          message
        );

      if (!staffId) {
        console.warn(
          `[Review Stats] Claim log found but staff ID could not be detected. Message ${message.id}`
        );

        continue;
      }

      const ticketNumber =
        extractTicketNumber(
          message
        );

      /*
       * Each actual claim log counts as one claim.
       *
       * If there is no ticket number, use the
       * message ID so the claim is still counted.
       */

      const claimKey =
        ticketNumber
          ? `${source.name}:ticket:${ticketNumber}`
          : `${source.name}:message:${message.id}`;

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
        }
      );

      claimCount++;
    }

    console.log(
      `[Review Stats] ${source.name}: detected ${claimCount} claim events`
    );
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
          .fetch(
            source.reviewLog
          )
          .catch(() => null);
    }

    if (!channel) {
      console.error(
        `[Review Stats] ${source.name} review log channel not found: ${source.reviewLog}`
      );

      continue;
    }

    if (!channel.isTextBased()) {
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
      `[Review Stats] ${source.name} review log: ${messages.length} messages`
    );

    for (const message of messages) {
      const embed =
        message?.embeds?.[0];

      if (!embed) {
        continue;
      }

      const title =
        String(
          embed.title || ''
        ).toLowerCase();

      /*
       * Support:
       *
       * ⭐ Feedback Received
       * Feedback Received
       */

      if (
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
        continue;
      }

      const key =
        `${source.name}:ticket:${ticketNumber}`;

      if (
        !reviews.has(
          key
        )
      ) {
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
  }

  /*
  |--------------------------------------------------------------------------
  | BUILD STAFF STATISTICS
  |--------------------------------------------------------------------------
  */

  for (const claim of claims.values()) {
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
     * EVERY CLAIM LOG = +1
     */

    stats.claims++;

    /*
     * Match review to ticket where
     * possible.
     */

    if (
      claim.ticketNumber
    ) {
      const review =
        reviews.get(
          `${claim.source}:ticket:${claim.ticketNumber}`
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
  | AVERAGES
  |--------------------------------------------------------------------------
  */

  for (
    const stats of
    staffStats.values()
  ) {
    if (
      stats.reviews > 0
    ) {
      stats.average =
        stats.totalRating /
        stats.reviews;
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
    `[Review Stats] TOTAL CLAIM EVENTS: ${claims.size}`
  );

  console.log(
    `[Review Stats] TOTAL REVIEW EVENTS: ${reviews.size}`
  );

  console.log(
    `[Review Stats] STAFF FOUND: ${staffStats.size}`
  );

  for (
    const stats of
    staffStats.values()
  ) {
    console.log(
      `[Review Stats] ${stats.userId} -> ${stats.claims} claims | ${stats.reviews} reviews | ${stats.average.toFixed(2)}/5`
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
    Math.max(
      0,
      Math.min(
        5,
        Math.round(value)
      )
    );

  return (
    '⭐'.repeat(
      rounded
    ) +
    '☆'.repeat(
      5 - rounded
    )
  );
}

function percentage(
  count,
  total
) {
  if (!total) {
    return '0%';
  }

  return `${Math.round(
    (count / total) * 100
  )}%`;
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
            .setEmoji(
              '🏆'
            ),

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
            .setEmoji(
              '👤'
            )
        )
    );
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
          staff.claims >=
          MIN_CLAIMS
      )
      .sort(
        (a, b) => {
          /*
           * Highest rating first.
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
           * More reviews next.
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
           * More claims next.
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
    Math.max(
      0,
      Math.min(
        page,
        totalPages - 1
      )
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
      `❌ No staff members with **${MIN_CLAIMS}+ claimed tickets** were found.`
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
      ) ||
      await guild.members
        .fetch(
          staff.userId
        )
        .catch(() => null);

    const mention =
      member
        ? member.toString()
        : `<@${staff.userId}>`;

    let medal = '';

    if (
      position === 1
    ) {
      medal = '🥇 ';
    } else if (
      position === 2
    ) {
      medal = '🥈 ';
    } else if (
      position === 3
    ) {
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

  const embed =
    new EmbedBuilder()
      .setColor(
        0xF8D568
      )
      .setTitle(
        '🏆 Staff Review Leaderboard'
      )
      .setDescription(
        lines.join(
          '\n\n'
        )
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
        .setLabel(
          'Previous'
        )
        .setEmoji(
          '⬅️'
        )
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
        .setLabel(
          'Next'
        )
        .setEmoji(
          '➡️'
        )
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
        .setLabel(
          'Close'
        )
        .setEmoji(
          '✖️'
        )
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
    .setColor(
      0xF8D568
    )
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
            ? `${stats.average.toFixed(2)}/5 ${stars(stats.average)}`
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
| COMMAND
|--------------------------------------------------------------------------
*/

export default {
  data:
    new SlashCommandBuilder()
      .setName(
        'review'
      )
      .setDescription(
        'View staff review statistics.'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageChannels
      )
      .addSubcommand(
        sub =>
          sub
            .setName(
              'stats'
            )
            .setDescription(
              'View staff review statistics.'
            )
      ),

  async execute(
    interaction
  ) {
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

    await interaction.deferReply({
      flags:
        MessageFlags.Ephemeral,
    });

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
          '❌ Failed to read the ticket logs. Make sure the bot has **View Channel** and **Read Message History** in the Normal and Merch ticket/review log channels.',
      });
    }

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
        time:
          10 * 60 * 1000,
      });

    collector.on(
      'collect',
      async component => {
        try {
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

              return interaction.editReply({
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
            }

            /*
             * ONE STAFF
             */

            if (
              selected ===
              'one_staff'
            ) {
              const userMenu =
                new UserSelectMenuBuilder()
                  .setCustomId(
                    'review_stats_staff'
                  )
                  .setPlaceholder(
                    'Select a staff member...'
                  )
                  .setMinValues(1)
                  .setMaxValues(1);

              return component.update({
                content:
                  '**👤 Staff Statistics**\nSelect the staff member:',
                embeds: [],
                components: [
                  new ActionRowBuilder()
                    .addComponents(
                      userMenu
                    ),
                ],
              });
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
                .fetch(
                  userId
                )
                .catch(() => null);

            if (!member) {
              return component.update({
                content:
                  '❌ Member not found.',
                embeds: [],
                components: [
                  new ActionRowBuilder()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId(
                          'review_stats_back'
                        )
                        .setLabel(
                          'Back'
                        )
                        .setEmoji(
                          '⬅️'
                        )
                        .setStyle(
                          ButtonStyle.Secondary
                        ),

                      new ButtonBuilder()
                        .setCustomId(
                          'review_stats_close'
                        )
                        .setLabel(
                          'Close'
                        )
                        .setEmoji(
                          '✖️'
                        )
                        .setStyle(
                          ButtonStyle.Danger
                        )
                    ),
                ],
              });
            }

            const staff =
              stats.get(
                userId
              );

            /*
             * IMPORTANT:
             *
             * If the staff member isn't in the
             * stats map, show zero instead of
             * crashing.
             */

            const staffStats =
              staff ||
              createStats(
                userId
              );

            return component.update({
              content: null,

              embeds: [
                buildStaffEmbed(
                  member,
                  staffStats
                ),
              ],

              components: [
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(
                        'review_stats_back'
                      )
                      .setLabel(
                        'Back'
                      )
                      .setEmoji(
                        '⬅️'
                      )
                      .setStyle(
                        ButtonStyle.Secondary
                      ),

                    new ButtonBuilder()
                      .setCustomId(
                        'review_stats_close'
                      )
                      .setLabel(
                        'Close'
                      )
                      .setEmoji(
                        '✖️'
                      )
                      .setStyle(
                        ButtonStyle.Danger
                      )
                  ),
              ],
            });
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
            return component.update({
              content:
                '**📊 Review Statistics**\nChoose which statistics you want to view:',
              embeds: [],
              components: [
                buildFilterMenu(),
              ],
            });
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
                ?.footer?.text ||
              '';

            const match =
              footer.match(
                /Page\s+(\d+)\/(\d+)/
              );

            let page =
              match
                ? Number(
                    match[1]
                  ) - 1
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

            return component.update({
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
            collector.stop(
              'closed'
            );

            return component.update({
              content:
                'Review statistics closed.',
              embeds: [],
              components: [],
            });
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

    collector.on(
      'end',
      async () => {
        try {
          await interaction.editReply({
            components: [],
          });
        } catch {
          // Message already deleted/expired.
        }
      }
    );
  },
};
