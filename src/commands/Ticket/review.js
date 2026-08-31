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
  ComponentType,
} from 'discord.js';

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

/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  return String(value ?? '')
    .replace(/<@!?(\d+)>/g, '$1')
    .trim();
}

function extractUserId(value) {
  if (!value) return null;

  const mention = String(value).match(
    /<@!?(\d+)>/
  );

  if (mention) {
    return mention[1];
  }

  const id = String(value).match(
    /\b\d{17,20}\b/
  );

  return id ? id[0] : null;
}

function extractTicketNumber(message) {
  if (!message) return null;

  const embed = message.embeds?.[0];

  if (!embed) return null;

  /*
   * First check embed fields.
   */
  for (const field of embed.fields || []) {
    const fieldName =
      String(field.name || '').toLowerCase();

    if (
      fieldName.includes('ticket') ||
      fieldName.includes('number') ||
      fieldName.includes('id')
    ) {
      const match =
        String(field.value || '').match(
          /\b\d{1,10}\b/
        );

      if (match) {
        return match[0];
      }
    }
  }

  /*
   * Then check the complete embed text.
   */
  const text = [
    embed.title,
    embed.description,
    ...(embed.fields || []).flatMap(field => [
      field.name,
      field.value,
    ]),
  ]
    .filter(Boolean)
    .join(' ');

  /*
   * Supports:
   * Ticket #123
   * Ticket 123
   * ticketNumber: 123
   */
  const ticketMatch = text.match(
    /ticket(?:\s*(?:number|id))?\s*#?\s*(\d+)/i
  );

  if (ticketMatch) {
    return ticketMatch[1];
  }

  return null;
}

function extractStaffFromClaimLog(message) {
  if (!message) return null;

  const embed = message.embeds?.[0];

  if (!embed) return null;

  /*
   * Look through every field.
   */
  for (const field of embed.fields || []) {
    const name =
      String(field.name || '').toLowerCase();

    const value =
      String(field.value || '');

    if (
      name.includes('claim') ||
      name.includes('staff') ||
      name.includes('executor') ||
      name.includes('user')
    ) {
      const id =
        extractUserId(value);

      if (id) {
        return id;
      }
    }
  }

  /*
   * Look through the description.
   */
  const description =
    embed.description || '';

  const patterns = [
    /claimed\s+by\s+<@!?(\d+)>/i,
    /claimed\s+by\s+.*?<@!?(\d+)>/i,
    /staff\s*[:\-]\s*<@!?(\d+)>/i,
    /executor\s*[:\-]\s*<@!?(\d+)>/i,
    /<@!?(\d+)>\s+(?:claimed|has claimed)/i,
  ];

  for (const pattern of patterns) {
    const match =
      description.match(pattern);

    if (match) {
      return match[1];
    }
  }

  /*
   * Finally inspect the entire embed.
   */
  const fullText = [
    embed.title,
    embed.description,
    ...(embed.fields || []).flatMap(field => [
      field.name,
      field.value,
    ]),
  ]
    .filter(Boolean)
    .join(' ');

  for (const pattern of patterns) {
    const match =
      fullText.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractRating(message) {
  if (!message) return null;

  const embed = message.embeds?.[0];

  if (!embed) return null;

  /*
   * Search fields first.
   */
  for (const field of embed.fields || []) {
    const name =
      String(field.name || '').toLowerCase();

    const value =
      String(field.value || '');

    if (
      name.includes('rating') ||
      name.includes('score') ||
      name.includes('star')
    ) {
      const numeric =
        value.match(
          /\b([1-5])(?:\s*\/\s*5)?\b/
        );

      if (numeric) {
        return Number(numeric[1]);
      }

      const stars =
        (value.match(/⭐/g) || [])
          .length;

      if (stars >= 1 && stars <= 5) {
        return stars;
      }
    }
  }

  /*
   * Search description/title.
   */
  const text = [
    embed.title,
    embed.description,
    ...(embed.fields || []).flatMap(field => [
      field.name,
      field.value,
    ]),
  ]
    .filter(Boolean)
    .join(' ');

  const numeric =
    text.match(
      /(?:rating|score|stars?)\s*[:\-]?\s*([1-5])(?:\s*\/\s*5)?/i
    );

  if (numeric) {
    return Number(numeric[1]);
  }

  const stars =
    (text.match(/⭐/g) || [])
      .length;

  if (stars >= 1 && stars <= 5) {
    return stars;
  }

  return null;
}

async function fetchAllMessages(channel) {
  const messages = [];
  let before = null;

  while (true) {
    const batch =
      await channel.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
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

/* =========================================================
   COLLECT CLAIMS + REVIEWS
========================================================= */

async function collectStatistics(guild) {
  const staffStats = new Map();

  /*
   * We keep claims and reviews separated first.
   * Reviews are later matched to tickets.
   */
  const claims = new Map();
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

  for (const source of sources) {
    /* -----------------------------------------------------
       CLAIM LOG
    ----------------------------------------------------- */

    const ticketChannel =
      guild.channels.cache.get(
        source.ticketLog
      ) ||
      await guild.channels
        .fetch(source.ticketLog)
        .catch(() => null);

    if (ticketChannel?.isTextBased()) {
      try {
        const messages =
          await fetchAllMessages(
            ticketChannel
          );

        for (const message of messages) {
          const embed =
            message.embeds?.[0];

          if (!embed) {
            continue;
          }

          const fullText = [
            embed.title,
            embed.description,
            ...(embed.fields || []).flatMap(
              field => [
                field.name,
                field.value,
              ]
            ),
          ]
            .filter(Boolean)
            .join(' ');

          /*
           * Don't depend on one exact title.
           */
          if (
            !/claim/i.test(fullText)
          ) {
            continue;
          }

          /*
           * Ignore "unclaimed".
           */
          if (
            /unclaim/i.test(fullText)
          ) {
            continue;
          }

          const ticketNumber =
            extractTicketNumber(
              message
            );

          const staffId =
            extractStaffFromClaimLog(
              message
            );

          if (
            !ticketNumber ||
            !staffId
          ) {
            continue;
          }

          /*
           * Count each ticket only once.
           */
          const key =
            `${source.name}:${ticketNumber}`;

          if (!claims.has(key)) {
            claims.set(key, {
              staffId,
              ticketNumber,
              source: source.name,
            });
          }
        }
      } catch (error) {
        console.error(
          `[Review Stats] Failed reading ${source.name} claim log:`,
          error
        );
      }
    }

    /* -----------------------------------------------------
       REVIEW LOG
    ----------------------------------------------------- */

    const reviewChannel =
      guild.channels.cache.get(
        source.reviewLog
      ) ||
      await guild.channels
        .fetch(source.reviewLog)
        .catch(() => null);

    if (reviewChannel?.isTextBased()) {
      try {
        const messages =
          await fetchAllMessages(
            reviewChannel
          );

        for (const message of messages) {
          const embed =
            message.embeds?.[0];

          if (!embed) {
            continue;
          }

          const fullText = [
            embed.title,
            embed.description,
            ...(embed.fields || []).flatMap(
              field => [
                field.name,
                field.value,
              ]
            ),
          ]
            .filter(Boolean)
            .join(' ');

          if (
            !/review|feedback|rating/i.test(
              fullText
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
            `${source.name}:${ticketNumber}`;

          if (!reviews.has(key)) {
            reviews.set(key, {
              ticketNumber,
              rating,
              source: source.name,
            });
          }
        }
      } catch (error) {
        console.error(
          `[Review Stats] Failed reading ${source.name} review log:`,
          error
        );
      }
    }
  }

  /*
   * Build staff statistics.
   */
  for (const claim of claims.values()) {
    if (!staffStats.has(claim.staffId)) {
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

    stats.claims++;

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

  for (const stats of staffStats.values()) {
    if (stats.reviews > 0) {
      stats.average =
        stats.totalRating /
        stats.reviews;
    }
  }

  /*
   * Debug output so if something is wrong,
   * Railway will tell us exactly what was found.
   */
  console.log(
    `[Review Stats] Claims found: ${claims.size}`
  );

  console.log(
    `[Review Stats] Reviews found: ${reviews.size}`
  );

  console.log(
    `[Review Stats] Staff found: ${staffStats.size}`
  );

  for (const stats of staffStats.values()) {
    console.log(
      `[Review Stats] ${stats.userId}: ${stats.claims} claims, ${stats.reviews} reviews, ${stats.average.toFixed(2)} avg`
    );
  }

  return staffStats;
}

/* =========================================================
   DISPLAY HELPERS
========================================================= */

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
      .sort((a, b) => {
        if (
          b.average !==
          a.average
        ) {
          return (
            b.average -
            a.average
          );
        }

        if (
          b.reviews !==
          a.reviews
        ) {
          return (
            b.reviews -
            a.reviews
          );
        }

        return (
          b.claims -
          a.claims
        );
      });

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
      Math.max(page, 0),
      totalPages - 1
    );

  const start =
    safePage * PAGE_SIZE;

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

    lines.push(
      `${medal}**#${position}** ${mention}\n` +
      `> ⭐ **${staff.average.toFixed(
        2
      )}/5** ${stars(
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
          `Staff must have at least **${MIN_CLAIMS} claimed tickets** to appear.`,
      })
      .setFooter({
        text:
          `Page ${
            safePage + 1
          }/${totalPages} • Normal + Merch`,
      })
      .setTimestamp();

  return {
    embed,
    page: safePage,
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
        name: '🎫 Tickets Claimed',
        value:
          String(stats.claims),
        inline: true,
      },
      {
        name: '📝 Reviews',
        value:
          String(stats.reviews),
        inline: true,
      },
      {
        name: '⭐ Average Rating',
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
        name: '⭐ 5 Stars',
        value:
          `${stats.ratings[5]} (${percentage(
            stats.ratings[5],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 4 Stars',
        value:
          `${stats.ratings[4]} (${percentage(
            stats.ratings[4],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 3 Stars',
        value:
          `${stats.ratings[3]} (${percentage(
            stats.ratings[3],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 2 Stars',
        value:
          `${stats.ratings[2]} (${percentage(
            stats.ratings[2],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 1 Star',
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

/* =========================================================
   COMMAND
========================================================= */

export default {
  data: new SlashCommandBuilder()
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
    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageChannels
      )
    ) {
      return interaction.reply({
        content:
          '❌ You need **Manage Channels** permission to use this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({
      ephemeral: true,
    });

    let stats;

    try {
      stats =
        await collectStatistics(
          interaction.guild
        );
    } catch (error) {
      console.error(
        '[Review Stats] Collection error:',
        error
      );

      return interaction.editReply({
        content:
          '❌ Failed to read the ticket/review logs. Check the bot permissions for those channels.',
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
        if (
          component.user.id !==
          interaction.user.id
        ) {
          return component.reply({
            content:
              '❌ Only the administrator who opened this menu can use it.',
            ephemeral: true,
          });
        }

        /* ALL STAFF */
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

            let page = 0;

            const result =
              buildLeaderboard(
                interaction.guild,
                stats,
                page
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

          /* ONE STAFF */
          if (
            component.values[0] ===
            'one_staff'
          ) {
            const menu =
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
                    menu
                  ),
              ],
            });

            return;
          }
        }

        /* STAFF SELECT */
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
            return component.reply({
              content:
                '❌ Member not found.',
              ephemeral: true,
            });
          }

          const staff =
            stats.get(userId);

          if (!staff) {
            return component.update({
              content:
                `❌ ${member} has no recorded claimed tickets.`,
              embeds: [],
              components: [],
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
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      'review_stats_back'
                    )
                    .setLabel(
                      'Back'
                    )
                    .setEmoji('⬅️')
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
                    .setEmoji('✖️')
                    .setStyle(
                      ButtonStyle.Danger
                    )
                ),
            ],
          });

          return;
        }

        /* BACK */
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
              new ActionRowBuilder()
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
                ),
            ],
          });

          return;
        }

        /* PAGINATION */
        if (
          component.isButton() &&
          (
            component.customId ===
              'review_stats_previous' ||
            component.customId ===
              'review_stats_next'
          )
        ) {
          const currentFooter =
            component.message.embeds?.[0]
              ?.footer?.text || '';

          const match =
            currentFooter.match(
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

        /* CLOSE */
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
          // Already expired.
        }
      }
    );
  },
};
