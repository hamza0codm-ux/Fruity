import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';

import {
  addSocialFeedChannel,
  removeSocialFeedChannel,
  getSocialFeedChannels,
  LIVE_ROLE_ID,
} from '../../services/socialFeedConfig.js';

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function platformEmoji(platform) {
  switch (
    String(platform || '')
      .toLowerCase()
  ) {
    case 'twitch':
      return '🟣';

    case 'youtube':
      return '🔴';

    case 'tiktok':
      return '⚫';

    default:
      return '🌐';
  }
}

function platformName(platform) {
  switch (
    String(platform || '')
      .toLowerCase()
  ) {
    case 'twitch':
      return 'Twitch';

    case 'youtube':
      return 'YouTube';

    case 'tiktok':
      return 'TikTok';

    default:
      return 'Unknown';
  }
}

function notificationTypeName(type) {
  switch (
    String(type || '')
      .toLowerCase()
  ) {
    case 'live':
      return '📡 Live';

    case 'posts':
      return '🎥 Posts';

    case 'both':
      return '📡🎥 Both';

    default:
      return 'Unknown';
  }
}

/*
|--------------------------------------------------------------------------
| Validate platform link
|--------------------------------------------------------------------------
*/

function validatePlatformLink(
  platform,
  link
) {
  let url;

  try {
    url =
      new URL(link);
  } catch {
    return false;
  }

  const host =
    url.hostname
      .toLowerCase()
      .replace(/^www\./, '');

  if (
    platform === 'twitch'
  ) {
    return (
      host === 'twitch.tv' ||
      host === 'm.twitch.tv'
    );
  }

  if (
    platform === 'youtube'
  ) {
    return (
      host === 'youtube.com' ||
      host === 'youtu.be'
    );
  }

  if (
    platform === 'tiktok'
  ) {
    return (
      host === 'tiktok.com' ||
      host === 'm.tiktok.com'
    );
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Build view embed
|--------------------------------------------------------------------------
*/

function buildChannelListEmbed(
  channels
) {
  const embed =
    new EmbedBuilder()
      .setColor(0xF8D568)
      .setTitle(
        '📡 Social Media Feeds'
      )
      .setFooter({
        text:
          `Live role: ${LIVE_ROLE_ID}`,
      })
      .setTimestamp();

  if (!channels.length) {
    embed.setDescription(
      'No social media feeds have been configured yet.'
    );

    return embed;
  }

  const lines = [];

  for (
    let i = 0;
    i < channels.length;
    i++
  ) {
    const channel =
      channels[i];

    const creator =
      channel.discordUserId
        ? `<@${channel.discordUserId}>`
        : '⚠️ Not linked';

    const ping =
      channel.pingRoleId
        ? `<@&${channel.pingRoleId}>`
        : 'None';

    const liveStatus =
      channel.isLive
        ? '🟢 **LIVE**'
        : '⚫ Offline';

    const destinationLive =
      channel.liveChannelId
        ? `<#${channel.liveChannelId}>`
        : 'None';

    const destinationPosts =
      channel.postChannelId
        ? `<#${channel.postChannelId}>`
        : 'None';

    lines.push(
      `**${i + 1}. ${channel.name}**\n` +
      `${platformEmoji(channel.platform)} **${platformName(channel.platform)}** • ${notificationTypeName(channel.notificationType)}\n` +
      `🔗 ${channel.link || channel.identifier}\n` +
      `👤 Discord user: ${creator}\n` +
      `${liveStatus} • 🔔 ${ping}\n` +
      `📡 Live channel: ${destinationLive}\n` +
      `🎥 Post channel: ${destinationPosts}`
    );
  }

  embed.setDescription(
    lines.join('\n\n')
  );

  return embed;
}

/*
|--------------------------------------------------------------------------
| Command
|--------------------------------------------------------------------------
*/

export default {
  data:
    new SlashCommandBuilder()
      .setName('social')
      .setDescription(
        'Manage customizable social media feeds.'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageGuild
      )

      /*
      |--------------------------------------------------------------------------
      | /social add
      |--------------------------------------------------------------------------
      */

      .addSubcommand(
        sub =>
          sub
            .setName('add')
            .setDescription(
              'Add a customizable social media feed.'
            )

            // REQUIRED OPTIONS FIRST
            .addStringOption(
              option =>
                option
                  .setName('name')
                  .setDescription(
                    'Custom name for this feed.'
                  )
                  .setRequired(true)
            )

            .addStringOption(
              option =>
                option
                  .setName('platform')
                  .setDescription(
                    'Social media platform.'
                  )
                  .setRequired(true)
                  .addChoices(
                    {
                      name: 'Twitch',
                      value: 'twitch',
                    },
                    {
                      name: 'YouTube',
                      value: 'youtube',
                    },
                    {
                      name: 'TikTok',
                      value: 'tiktok',
                    }
                  )
            )

            .addStringOption(
              option =>
                option
                  .setName('platform_link')
                  .setDescription(
                    'Full Twitch, YouTube, or TikTok creator link.'
                  )
                  .setRequired(true)
            )

            .addStringOption(
              option =>
                option
                  .setName('notifications')
                  .setDescription(
                    'What should this feed notify for?'
                  )
                  .setRequired(true)
                  .addChoices(
                    {
                      name: '📡 Live',
                      value: 'live',
                    },
                    {
                      name: '🎥 Posts',
                      value: 'posts',
                    },
                    {
                      name: '📡🎥 Both',
                      value: 'both',
                    }
                  )
            )

            .addUserOption(
              option =>
                option
                  .setName('discord_user')
                  .setDescription(
                    'Discord user who owns this social account.'
                  )
                  .setRequired(true)
            )

            // OPTIONAL OPTIONS AFTER REQUIRED OPTIONS
            .addChannelOption(
              option =>
                option
                  .setName('live_channel')
                  .setDescription(
                    'Discord channel for live notifications.'
                  )
                  .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                  )
                  .setRequired(false)
            )

            .addChannelOption(
              option =>
                option
                  .setName('post_channel')
                  .setDescription(
                    'Discord channel for new post/video notifications.'
                  )
                  .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                  )
                  .setRequired(false)
            )

            .addRoleOption(
              option =>
                option
                  .setName('ping_role')
                  .setDescription(
                    'Optional role to ping for notifications.'
                  )
                  .setRequired(false)
            )
      )

      /*
      |--------------------------------------------------------------------------
      | /social remove
      |--------------------------------------------------------------------------
      */

      .addSubcommand(
        sub =>
          sub
            .setName('remove')
            .setDescription(
              'Remove a configured social feed.'
            )
      )

      /*
      |--------------------------------------------------------------------------
      | /social view
      |--------------------------------------------------------------------------
      */

      .addSubcommand(
        sub =>
          sub
            .setName('view')
            .setDescription(
              'View all configured social feeds.'
            )
      ),

  /*
  |--------------------------------------------------------------------------
  | Execute
  |--------------------------------------------------------------------------
  */

  async execute(
    interaction
  ) {
    if (
      !interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      )
    ) {
      return interaction.reply({
        content:
          '❌ You need **Manage Server** permission to use this command.',
        flags:
          MessageFlags.Ephemeral,
      });
    }

    const subcommand =
      interaction.options.getSubcommand();

    /*
    |--------------------------------------------------------------------------
    | ADD
    |--------------------------------------------------------------------------
    */

    if (
      subcommand === 'add'
    ) {
      const name =
        interaction.options.getString(
          'name',
          true
        );

      const platform =
        interaction.options.getString(
          'platform',
          true
        );

      const platformLink =
        interaction.options.getString(
          'platform_link',
          true
        ).trim();

      const notifications =
        interaction.options.getString(
          'notifications',
          true
        );

      const liveChannel =
        interaction.options.getChannel(
          'live_channel'
        );

      const postChannel =
        interaction.options.getChannel(
          'post_channel'
        );

      const discordUser =
        interaction.options.getUser(
          'discord_user',
          true
        );

      const pingRole =
        interaction.options.getRole(
          'ping_role'
        );

      /*
       * Validate URL.
       */

      if (
        !validatePlatformLink(
          platform,
          platformLink
        )
      ) {
        return interaction.reply({
          content:
            `❌ That does not look like a valid **${platformName(platform)}** link.`,
          flags:
            MessageFlags.Ephemeral,
        });
      }

      /*
       * Require correct destination channels.
       */

      if (
        (
          notifications === 'live' ||
          notifications === 'both'
        ) &&
        !liveChannel
      ) {
        return interaction.reply({
          content:
            '❌ You selected live notifications, so you must select a **Live Channel**.',
          flags:
            MessageFlags.Ephemeral,
        });
      }

      if (
        (
          notifications === 'posts' ||
          notifications === 'both'
        ) &&
        !postChannel
      ) {
        return interaction.reply({
          content:
            '❌ You selected post notifications, so you must select a **Post Channel**.',
          flags:
            MessageFlags.Ephemeral,
        });
      }

      /*
       * Don't allow everyone.
       */

      if (
        pingRole &&
        pingRole.id ===
          interaction.guild.id
      ) {
        return interaction.reply({
          content:
            '❌ You cannot use `@everyone` as the notification ping role.',
          flags:
            MessageFlags.Ephemeral,
        });
      }

      /*
       * Don't allow managed roles.
       */

      if (
        pingRole &&
        pingRole.managed
      ) {
        return interaction.reply({
          content:
            '❌ That role is managed by an integration and cannot be used.',
          flags:
            MessageFlags.Ephemeral,
        });
      }

      /*
       * Make sure Discord user is in server.
       */

      const creatorMember =
        await interaction.guild.members
          .fetch(
            discordUser.id
          )
          .catch(() => null);

      if (!creatorMember) {
        return interaction.reply({
          content:
            '❌ That Discord user is not a member of this server.',
          flags:
            MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({
        flags:
          MessageFlags.Ephemeral,
      });

      try {
        const feed =
          await addSocialFeedChannel(
            interaction.client,
            interaction.guild.id,
            {
              name,

              platform,

              link:
                platformLink,

              notificationType:
                notifications,

              liveChannelId:
                liveChannel?.id ||
                null,

              postChannelId:
                postChannel?.id ||
                null,

              discordUserId:
                discordUser.id,

              pingRoleId:
                pingRole?.id ||
                null,
            }
          );

        return interaction.editReply({
          content:
            `✅ **Social feed added!**\n\n` +

            `🏷️ **Name:** ${feed.name}\n` +

            `${platformEmoji(feed.platform)} **Platform:** ${platformName(feed.platform)}\n` +

            `🔗 **Link:** ${feed.link}\n` +

            `🔔 **Notifications:** ${notificationTypeName(feed.notificationType)}\n` +

            `📡 **Live channel:** ${
              feed.liveChannelId
                ? `<#${feed.liveChannelId}>`
                : 'Disabled'
            }\n` +

            `🎥 **Post channel:** ${
              feed.postChannelId
                ? `<#${feed.postChannelId}>`
                : 'Disabled'
            }\n` +

            `👤 **Discord user:** <@${feed.discordUserId}>\n` +

            `🔔 **Ping role:** ${
              feed.pingRoleId
                ? `<@&${feed.pingRoleId}>`
                : 'None'
            }\n\n` +

            `🎭 **Live role:** <@&${LIVE_ROLE_ID}>`,
        });
      } catch (error) {
        console.error(
          '[Social Feed] Add error:',
          error
        );

        return interaction.editReply({
          content:
            `❌ ${
              error.message ||
              'Failed to add social feed.'
            }`,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | REMOVE
    |--------------------------------------------------------------------------
    */

    if (
      subcommand === 'remove'
    ) {
      const channels =
        await getSocialFeedChannels(
          interaction.client,
          interaction.guild.id
        );

      if (!channels.length) {
        return interaction.reply({
          content:
            '❌ There are no social feeds configured.',
          flags:
            MessageFlags.Ephemeral,
        });
      }

      /*
       * IMPORTANT:
       *
       * The menu displays the CUSTOM
       * feed name, not the Discord username.
       */

      const options =
        channels
          .slice(0, 25)
          .map(channel =>
            new StringSelectMenuOptionBuilder()
              .setLabel(
                channel.name
                  .slice(0, 100)
              )
              .setDescription(
                `${platformName(channel.platform)} • ${
                  notificationTypeName(
                    channel.notificationType
                  )
                }`
                  .slice(0, 100)
              )
              .setValue(
                channel.id
              )
          );

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `social_remove_${interaction.user.id}`
          )
          .setPlaceholder(
            'Select a social feed to remove...'
          )
          .addOptions(
            options
          );

      const row =
        new ActionRowBuilder()
          .addComponents(
            menu
          );

      return interaction.reply({
        content:
          '🗑️ **Select the social feed you want to remove.**',
        components: [
          row,
        ],
        flags:
          MessageFlags.Ephemeral,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | VIEW
    |--------------------------------------------------------------------------
    */

    if (
      subcommand === 'view'
    ) {
      const channels =
        await getSocialFeedChannels(
          interaction.client,
          interaction.guild.id
        );

      return interaction.reply({
        embeds: [
          buildChannelListEmbed(
            channels
          ),
        ],
        flags:
          MessageFlags.Ephemeral,
      });
    }
  },
};
