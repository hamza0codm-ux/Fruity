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

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getTicketNumber(message) {
  if (!message?.embeds?.length) return null;

  const embed = message.embeds[0];

  const fields = embed.fields || [];

  const ticketField = fields.find(
    field =>
      String(field.name).toLowerCase() === 'ticket'
  );

  if (ticketField?.value) {
    const match = String(ticketField.value).match(/\d+/);
    if (match) return match[0];
  }

  const text = [
    embed.title || '',
    embed.description || '',
  ].join(' ');

  const match = text.match(
    /ticket\s*#?\s*(\d+)/i
  );

  return match ? match[1] : null;
}

function getUserIdFromMention(value) {
  if (!value) return null;

  const match = String(value).match(
    /<@!?(\d+)>/
  );

  return match ? match[1] : null;
}

function getClaimedBy(message) {
  if (!message?.embeds?.length) return null;

  const embed = message.embeds[0];

  const field = (embed.fields || []).find(
    f =>
      String(f.name).toLowerCase() ===
      'claimed by'
  );

  if (!field?.value) return null;

  return getUserIdFromMention(field.value);
}

function getRating(message) {
  if (!message?.embeds?.length) return null;

  const embed = message.embeds[0];

  const fields = embed.fields || [];

  const field = fields.find(
    f =>
      String(f.name).toLowerCase() ===
      'rating'
  );

  if (!field?.value) return null;

  const value = String(field.value);

  /*
   * Handles:
   * ⭐⭐⭐⭐⭐
   * 5
   * ⭐ 5
   */
  const numberMatch = value.match(
    /(?:^|\s)([1-5])(?:\s|$)/
  );

  if (numberMatch) {
    return Number(numberMatch[1]);
  }

  const stars = (
    value.match(/⭐/g) || []
  ).length;

  if (stars >= 1 && stars <= 5) {
    return stars;
  }

  return null;
}

function getReviewTicketNumber(message) {
  return getTicketNumber(message);
}

function createStatsObject(userId) {
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

async function fetchAllMessages(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (!batch.size) break;

    messages.push(...batch.values());

    if (batch.size < 100) break;

    before = batch.last()?.id;

    if (!before) break;
  }

  return messages;
}

/*
|--------------------------------------------------------------------------
| Load statistics
|--------------------------------------------------------------------------
*/

async function collectStatistics(guild) {
  const claimMap = new Map();
  const reviewMap = new Map();

  const sources = [
    {
      type: 'normal',
      ticketLog: NORMAL.ticketLog,
      reviewLog: NORMAL.reviewLog,
    },
    {
      type: 'merch',
      ticketLog: MERCH.ticketLog,
      reviewLog: MERCH.reviewLog,
    },
  ];

  for (const source of sources) {
    /*
     * CLAIMS
     */
    const ticketChannel =
      guild.channels.cache.get(
        source.ticketLog
      ) ||
      await guild.channels
        .fetch(source.ticketLog)
        .catch(() => null);

    if (ticketChannel?.isTextBased()) {
      let messages = [];

      try {
        messages =
          await fetchAllMessages(
            ticketChannel
          );
      } catch {
        messages = [];
      }

      for (const message of messages) {
        if (
          message.author?.id ===
          guild.client.user?.id
        ) {
          const title =
            message.embeds?.[0]?.title ||
            '';

          if (
            title
              .toLowerCase()
              .includes('ticket claimed')
          ) {
            const ticketNumber =
              getTicketNumber(message);

            const staffId =
              getClaimedBy(message);

            if (
              ticketNumber &&
              staffId
            ) {
              if (
                !claimMap.has(ticketNumber)
              ) {
                claimMap.set(
                  ticketNumber,
                  {
                    staffId,
                    type: source.type,
                  }
                );
              }
            }
          }
        }
      }
    }

    /*
     * REVIEWS
     */
    const reviewChannel =
      guild.channels.cache.get(
        source.reviewLog
      ) ||
      await guild.channels
        .fetch(source.reviewLog)
        .catch(() => null);

    if (reviewChannel?.isTextBased()) {
      let messages = [];

      try {
        messages =
          await fetchAllMessages(
            reviewChannel
          );
      } catch {
        messages = [];
      }

      for (const message of messages) {
        if (
          message.author?.id !==
          guild.client.user?.id
        ) {
          continue;
        }

        const title =
          message.embeds?.[0]?.title ||
          '';

        if (
          !title
            .toLowerCase()
            .includes('feedback')
        ) {
          continue;
        }

        const ticketNumber =
          getReviewTicketNumber(message);

        const rating =
          getRating(message);

        if (
          !ticketNumber ||
          !rating
        ) {
          continue;
        }

        if (
          !reviewMap.has(ticketNumber)
        ) {
          reviewMap.set(
            ticketNumber,
            {
              rating,
              type: source.type,
            }
          );
        }
      }
    }
  }

  /*
   * Combine claim + review data by ticket number.
   */
  const staffStats = new Map();

  for (
    const [ticketNumber, claim] of
    claimMap.entries()
  ) {
    if (!staffStats.has(claim.staffId)) {
      staffStats.set(
        claim.staffId,
        createStatsObject(
          claim.staffId
        )
      );
    }

    const stats =
      staffStats.get(
        claim.staffId
      );

    stats.claims++;

    const review =
      reviewMap.get(ticketNumber);

    if (review) {
      stats.reviews++;
      stats.totalRating +=
        review.rating;

      stats.ratings[
        review.rating
      ]++;
    }
  }

  /*
   * Calculate averages.
   */
  for (const stats of staffStats.values()) {
    if (stats.reviews > 0) {
      stats.average =
        stats.totalRating /
        stats.reviews;
    }
  }

  return staffStats;
}

/*
|--------------------------------------------------------------------------
| Formatting
|--------------------------------------------------------------------------
*/

function stars(rating) {
  const rounded =
    Math.round(rating);

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

function ratingBar(count, total) {
  if (!total) {
    return '0%';
  }

  return `${Math.round(
    (count / total) * 100
  )}%`;
}

async function resolveMember(guild, userId) {
  return guild.members.cache.get(userId) ||
    await guild.members
      .fetch(userId)
      .catch(() => null);
}

function buildLeaderboardEmbed(
  guild,
  stats,
  page
) {
  const eligible = [...stats.values()]
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

  const safePage = Math.min(
    Math.max(page, 0),
    totalPages - 1
  );

  const start =
    safePage * PAGE_SIZE;

  const pageItems =
    eligible.slice(
      start,
      start + PAGE_SIZE
    );

  const lines = [];

  if (!pageItems.length) {
    lines.push(
      'No staff members currently have **5 or more claimed tickets**.'
    );
  }

  for (
    let index = 0;
    index < pageItems.length;
    index++
  ) {
    const position =
      start + index + 1;

    const staff =
      pageItems[index];

    const member =
      guild.members.cache.get(
        staff.userId
      );

    const name = member
      ? member.toString()
      : `<@${staff.userId}>`;

    let medal = '';

    if (position === 1)
      medal = '🥇 ';
    else if (position === 2)
      medal = '🥈 ';
    else if (position === 3)
      medal = '🥉 ';

    lines.push(
      `${medal}**#${position}** ${name}\n` +
      `> ⭐ **${staff.average.toFixed(
        2
      )}/5** ${stars(staff.average)}\n` +
      `> 🎫 **${staff.claims}** claimed • 📝 **${staff.reviews}** reviews`
    );
  }

  return {
    embed: new EmbedBuilder()
      .setColor(0xF8D568)
      .setTitle('🏆 Staff Review Leaderboard')
      .setDescription(
        lines.join('\n\n')
      )
      .addFields({
        name: 'Ranking Requirements',
        value:
          `Only staff with **${MIN_CLAIMS}+ claimed tickets** are shown.`,
        inline: false,
      })
      .setFooter({
        text:
          `Page ${
            safePage + 1
          }/${totalPages} • Normal + Merch tickets`,
      })
      .setTimestamp(),

    page: safePage,
    totalPages,
  };
}

function buildPaginationRow(
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
      `📊 Review Statistics — ${
        member.user.username
      }`
    )
    .setThumbnail(
      member.user.displayAvatarURL({
        size: 256,
      })
    )
    .addFields(
      {
        name: '🎫 Tickets Claimed',
        value: String(
          stats.claims
        ),
        inline: true,
      },
      {
        name: '📝 Reviews',
        value: String(
          stats.reviews
        ),
        inline: true,
      },
      {
        name: '⭐ Average Rating',
        value:
          stats.reviews > 0
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
          `${stats.ratings[5]} ` +
          `(${ratingBar(
            stats.ratings[5],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 4 Stars',
        value:
          `${stats.ratings[4]} ` +
          `(${ratingBar(
            stats.ratings[4],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 3 Stars',
        value:
          `${stats.ratings[3]} ` +
          `(${ratingBar(
            stats.ratings[3],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 2 Stars',
        value:
          `${stats.ratings[2]} ` +
          `(${ratingBar(
            stats.ratings[2],
            total
          )})`,
        inline: true,
      },
      {
        name: '⭐ 1 Star',
        value:
          `${stats.ratings[1]} ` +
          `(${ratingBar(
            stats.ratings[1],
            total
          )})`,
        inline: true,
      }
    )
    .setFooter({
      text:
        'Statistics include Normal + Merch tickets',
    })
    .setTimestamp();
}

/*
|--------------------------------------------------------------------------
| Main command
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
        '[Review Stats] Failed to collect statistics:',
        error
      );

      return interaction.editReply({
        content:
          '❌ I could not read the ticket/review logs. Make sure I can **View Channel** and **Read Message History** in the ticket and review log channels.',
      });
    }

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

    const row =
      new ActionRowBuilder()
        .addComponents(menu);

    const message =
      await interaction.editReply({
        content:
          '**📊 Review Statistics**\nChoose which statistics you want to view:',
        components: [row],
      });

    const collector =
      message.createMessageComponentCollector({
        time: 10 * 60 * 1000,
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

        /*
         * ALL STAFF
         */
        if (
          component.isStringSelectMenu() &&
          component.customId ===
            'review_stats_filter'
        ) {
          const value =
            component.values[0];

          if (
            value ===
            'all_staff'
          ) {
            let page = 0;

            const render = async () => {
              const result =
                buildLeaderboardEmbed(
                  interaction.guild,
                  stats,
                  page
                );

              await component.editReply({
                content: null,
                embeds: [
                  result.embed,
                ],
                components: [
                  buildPaginationRow(
                    result.page,
                    result.totalPages
                  ),
                ],
              });

              page =
                result.page;
            };

            await component.deferUpdate();

            const result =
              buildLeaderboardEmbed(
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
                buildPaginationRow(
                  result.page,
                  result.totalPages
                ),
              ],
            });

            page =
              result.page;

            /*
             * Temporary pagination collector.
             */
            const buttonCollector =
              message.createMessageComponentCollector({
                componentType:
                  ComponentType.Button,
                time:
                  10 * 60 * 1000,
              });

            buttonCollector.on(
              'collect',
              async button => {
                if (
                  button.user.id !==
                  interaction.user.id
                ) {
                  return button.reply({
                    content:
                      '❌ Only the administrator who opened this menu can use it.',
                    ephemeral: true,
                  });
                }

                if (
                  button.customId ===
                  'review_stats_close'
                ) {
                  buttonCollector.stop(
                    'closed'
                  );

                  await button.deferUpdate();

                  await interaction.editReply({
                    content:
                      'Review statistics closed.',
                    embeds: [],
                    components: [],
                  });

                  return;
                }

                if (
                  button.customId ===
                  'review_stats_previous'
                ) {
                  page =
                    Math.max(
                      0,
                      page - 1
                    );
                }

                if (
                  button.customId ===
                  'review_stats_next'
                ) {
                  const totalPages =
                    Math.max(
                      1,
                      Math.ceil(
                        [...stats.values()]
                          .filter(
                            s =>
                              s.claims >=
                              MIN_CLAIMS
                          ).length /
                          PAGE_SIZE
                      )
                    );

                  page =
                    Math.min(
                      totalPages - 1,
                      page + 1
                    );
                }

                const updated =
                  buildLeaderboardEmbed(
                    interaction.guild,
                    stats,
                    page
                  );

                await button.update({
                  embeds: [
                    updated.embed,
                  ],
                  components: [
                    buildPaginationRow(
                      updated.page,
                      updated.totalPages
                    ),
                  ],
                });
              }
            );

            return;
          }

          /*
           * ONE STAFF
           */
          if (
            value ===
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

            const userRow =
              new ActionRowBuilder()
                .addComponents(
                  userMenu
                );

            await component.update({
              content:
                '**👤 Staff Statistics**\nSelect the staff member you want to view:',
              embeds: [],
              components: [
                userRow,
              ],
            });
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
            await resolveMember(
              interaction.guild,
              userId
            );

          if (!member) {
            return component.reply({
              content:
                '❌ I could not find that member in this server.',
              ephemeral: true,
            });
          }

          const staffStats =
            stats.get(userId);

          if (!staffStats) {
            return component.update({
              content:
                `❌ ${member} has no recorded claimed tickets yet.`,
              embeds: [],
              components: [],
            });
          }

          await component.update({
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
        }

        /*
         * BACK
         */
        if (
          component.isButton() &&
          component.customId ===
            'review_stats_back'
        ) {
          const newMenu =
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

          await component.update({
            content:
              '**📊 Review Statistics**\nChoose which statistics you want to view:',
            embeds: [],
            components: [
              new ActionRowBuilder()
                .addComponents(
                  newMenu
                ),
            ],
          });
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
          // Interaction already expired/deleted.
        }
      }
    );
  },
};
