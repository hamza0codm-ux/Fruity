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
| These match the current FruityINC ticketLogging.js configuration.
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
| BASIC HELPERS
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

  const target = String(name).toLowerCase();

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

  const mention = String(value).match(
    /<@!?(\d{17,20})>/
  );

  if (mention) {
    return mention[1];
  }

  const rawId = String(value).match(
    /\b\d{17,20}\b/
  );

  return rawId?.[0] || null;
}

function extractTicketNumber(message) {
  const embed = message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * The actual FruityINC claim/review embeds have:
   *
   * Ticket
   * #123
   */

  const ticketField = getField(
    embed,
    'Ticket'
  );

  if (ticketField) {
    const match =
      String(ticketField).match(
        /#?(\d+)/
      );

    if (match) {
      return match[1];
    }
  }

  /*
   * Fallback in case an older log has a slightly
   * different field name.
   */

  for (const field of embed.fields || []) {
    const fieldName =
      String(field.name || '')
        .toLowerCase();

    if (
      fieldName.includes('ticket') ||
      fieldName.includes('number')
    ) {
      const match =
        String(field.value || '').match(
          /#?(\d+)/
        );

      if (match) {
        return match[1];
      }
    }
  }

  /*
   * Final fallback: inspect the entire embed.
   */

  const text =
    getEmbedText(embed);

  const match =
    text.match(
      /ticket(?:\s*(?:number|id))?\s*#?\s*(\d+)/i
    );

  return match?.[1] || null;
}

function extractClaimedStaffId(message) {
  const embed = message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * Actual FruityINC field:
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
    return extractUserId(
      claimedBy
    );
  }

  /*
   * Fallback for differently-cased
   * or older logs.
   */

  for (const field of embed.fields || []) {
    const name =
      String(field.name || '')
        .toLowerCase();

    if (
      name.includes('claimed by') ||
      name.includes('claimer') ||
      name.includes('claimed')
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
   * Fallback to executor mention
   * if it appears in the embed text.
   */

  const text =
    getEmbedText(embed);

  const match =
    text.match(
      /claimed\s+by\s+<@!?(\d{17,20})>/i
    );

  return match?.[1] || null;
}

function extractRating(message) {
  const embed = message?.embeds?.[0];

  if (!embed) {
    return null;
  }

  /*
   * Actual FruityINC feedback embed:
   *
   * Rating
   * ⭐⭐⭐⭐⭐
   */

  const ratingField =
    getField(
      embed,
      'Rating'
    );

  if (ratingField) {
    const stars =
      (
        String(ratingField)
          .match(/⭐/g) || []
      ).length;

    if (
      stars >= 1 &&
      stars <= 5
    ) {
      return stars;
    }

    const numeric =
      String(ratingField).match(
        /\b([1-5])(?:\s*\/\s*5)?\b/
      );

    if (numeric) {
      return Number(
        numeric[1]
      );
    }
  }

  /*
   * Fallback.
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
| COLLECT STATISTICS
|--------------------------------------------------------------------------
*/

async function collectStatistics(guild) {
  const staffStats =
    new Map();

  /*
   * Every claim is stored here:
   *
   * Normal:123
   * Merch:456
   *
   * {
   *   staffId,
   *   ticketNumber
   * }
   */

  const claims =
    new Map();

  /*
   * Reviews are stored separately and
   * matched to claims by ticket number.
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

  for (const source of sources) {
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

    if (!channel.isTextBased()) {
      console.error(
        `[Review Stats] ${source.name} ticket log is not text based`
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
        `[Review Stats] Could not read ${source.name} ticket logs:`,
        error
      );

      continue;
    }

    console.log(
      `[Review Stats] ${source.name}: read ${messages.length} log messages`
    );

    for (const message of messages) {
      const embed =
        message.embeds?.[0];

      if (!embed) {
        continue;
      }

      /*
       * ONLY count actual Ticket Claimed
       * events.
       *
       * This prevents:
       * Ticket Unclaimed
       * from being counted.
       */

      const title =
        String(
          embed.title || ''
        ).toLowerCase();

      if (
        title !==
        'ticket claimed'
      ) {
        continue;
      }

      const staffId =
        extractClaimedStaffId(
          message
        );

      const ticketNumber =
        extractTicketNumber(
          message
        );

      /*
       * If the staff ID exists, count it
       * even if an old log is missing its
       * ticket number.
       *
       * This is important because the
       * leaderboard is based on claims.
       */

      if (!staffId) {
        console.warn(
          `[Review Stats] Found Ticket Claimed log but could not find staff member. Message: ${message.id}`
        );

        continue;
      }

      const claimKey =
        ticketNumber
          ? `${source.name}:${ticketNumber}`
          : `${source.name}:message:${message.id}`;

      /*
       * Avoid counting the same log twice.
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
        }
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | READ REVIEW LOGS
  |--------------------------------------------------------------------------
  */

  for (const source of sources) {
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
        `[Review Stats] Could not read ${source.name} review logs:`,
        error
      );

      continue;
    }

    console.log(
      `[Review Stats] ${source.name}: read ${messages.length} review messages`
    );

    for (const message of messages) {
      const embed =
        message.embeds?.[0];

      if (!embed) {
        continue;
      }

      const title =
        String(
          embed.title || ''
        ).toLowerCase();

      if (
        title !==
        '⭐ feedback received'
        &&
        title !==
        'feedback received'
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
        `${source.name}:${ticketNumber}`;

      /*
       * One review per ticket.
       */

      if (
        !reviews.has(key)
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
     * THIS is the important part:
     *
     * Every Ticket Claimed event = +1 claim.
     */

    stats.claims++;

    /*
     * Match review to the claimed ticket.
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
  | DEBUG OUTPUT
  |--------------------------------------------------------------------------
  */

  console.log(
    '========================================'
  );

  console.log(
    `[Review Stats] TOTAL CLAIM EVENTS: ${claims.size}`
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
      `[Review Stats] Staff ${stats.userId}: ${stats.claims} claims | ${stats.reviews} reviews | ${stats.average.toFixed(2)}/5`
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
    '⭐'.repeat(
      rounded
    ) +
    '☆'.repeat(
      Math.max(
        0,
        5 - rounded
      )
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
           * Then number of reviews.
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
           * Then number of claims.
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
        ? `${staff.average.toFixed(
            2
          )}/5`
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
    page:
      safePage,
    totalPages,
  };
}

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
| INDIVIDUAL STAFF EMBED
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
| MAIN COMMAND
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
          '❌ Failed to read the ticket logs. Check that the bot has **View Channel** and **Read Message History** in the normal and merch log channels.',
      });
    }

    const filterMenu =
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
        );

    const message =
      await interaction.editReply({
        content:
          '**📊 Review Statistics**\nChoose which statistics you want to view:',
        components: [
          new ActionRowBuilder()
            .addComponents(
              filterMenu
            ),
        ],
      });

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
           * ALL STAFF
           */

          if (
            component.isStringSelectMenu() &&
            component.customId ===
              'review_stats_filter'
          ) {
            if (
              component.values[0] ===
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
                content:
                  null,

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
              component.values[0] ===
              'one_staff'
            ) {
              const userMenu =
                new UserSelectMenuBuilder()
                  .setCustomId(
                    'review_stats_staff'
                  )
                  .setPlaceholder(
                    'Select a staff member...'
                  );

              await component.update({
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

              return;
            }
          }

          /*
           * STAFF SELECT
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
                .catch(
                  () => null
                );

            if (!member) {
              return component.update({
                content:
                  '❌ Member not found.',
                embeds: [],
                components: [],
              });
            }

            const staff =
              stats.get(
                userId
              );

            if (!staff) {
              return component.update({
                content:
                  `❌ ${member} has no recorded claimed tickets.`,
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

            await component.update({
              content:
                null,

              embeds: [
                buildStaffEmbed(
                  member,
                  staff
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

            return;
          }

          /*
           * BACK
           */

          if (
            component.isButton() &&
            component.customId ===
              'review_stats_back'
          ) {
            const menu =
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
                );

            await component.update({
              content:
                '**📊 Review Statistics**\nChoose which statistics you want to view:',
              embeds: [],
              components: [
                new ActionRowBuilder()
                  .addComponents(
                    menu
                  ),
              ],
            });

            return;
          }

          /*
           * PAGINATION
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
           * CLOSE
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
          // Interaction/message already expired.
        }
      }
    );
  },
};
