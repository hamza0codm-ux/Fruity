import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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
    String(platform || '').toLowerCase()
  ) {
    case 'twitch':
      return '🟣';

    case 'youtube':
      return '🔴';

    case 'tiktok':
      return '⚫';

    default:
      return '📡';
  }
}

function platformName(platform) {
  switch (
    String(platform || '').toLowerCase()
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

function buildChannelListEmbed(
  guild,
  channels
) {
  const embed =
    new EmbedBuilder()
      .setColor(0xF8D568)
      .setTitle(
        '📡 Social Media Live Channels'
      )
      .setFooter({
        text:
          `Live role: ${LIVE_ROLE_ID}`,
      })
      .setTimestamp();

  if (!channels.length) {
    embed.setDescription(
      'No social media channels have been configured yet.'
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

    const ping =
      channel.pingRoleId
        ? `<@&${channel.pingRoleId}>`
        : 'No ping role';

    const creator =
      channel.discordUserId
        ? `<@${channel.discordUserId}>`
        : '⚠️ Not linked';

    const liveStatus =
      channel.isLive
        ? '🟢 **LIVE**'
        : '⚫ Offline';

    lines.push(
      `**${i + 1}. ${channel.name}**\n` +
      `${platformEmoji(channel.platform)} ${platformName(channel.platform)} • \`${channel.identifier}\`\n` +
      `👤 Creator: ${creator}\n` +
      `${liveStatus} • 🔔 ${ping}`
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
        'Manage social media live notifications.'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageGuild
      )

      /*
       * /social add
       */

      .addSubcommand(
        sub =>
          sub
            .setName('add')
            .setDescription(
              'Add a Twitch, YouTube, or TikTok channel.'
            )

            /*
             * Friendly name
             */

            .addStringOption(
              option =>
                option
                  .setName('name')
                  .setDescription(
                    'A name to easily identify this creator.'
                  )
                  .setRequired(true)
            )

            /*
             * Platform
             */

            .addStringOption(
              option =>
                option
                  .setName('platform')
                  .setDescription(
                    'The platform.'
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

            /*
             * Social media username / channel
             */

            .addStringOption(
              option =>
                option
                  .setName('channel')
                  .setDescription(
                    'Twitch username, YouTube channel ID/handle, or TikTok username.'
                  )
                  .setRequired(true)
            )

            /*
             * Discord member who owns the social account.
             *
             * This is what the live role will be
             * added to and removed from.
             */

            .addUserOption(
              option =>
                option
                  .setName('creator')
                  .setDescription(
                    'The Discord member who should receive the live role.'
                  )
                  .setRequired(true)
            )

            /*
             * Optional notification role.
             */

            .addRoleOption(
              option =>
                option
                  .setName('ping_role')
                  .setDescription(
                    'Role to mention when this creator goes live. Optional.'
                  )
                  .setRequired(false)
            )
      )

      /*
       * /social remove
       */

      .addSubcommand(
        sub =>
          sub
            .setName('remove')
            .setDescription(
              'Remove a configured social media channel.'
            )
      )

      /*
       * /social view
       */

      .addSubcommand(
        sub =>
          sub
            .setName('view')
            .setDescription(
              'View all configured social media channels.'
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

      const identifier =
        interaction.options.getString(
          'channel',
          true
        );

      const creator =
        interaction.options.getUser(
          'creator',
          true
        );

      const pingRole =
        interaction.options.getRole(
          'ping_role'
        );

      /*
       * Don't allow @everyone.
       */

      if (
        pingRole &&
        pingRole.id ===
          interaction.guild.id
      ) {
        return interaction.reply({
          content:
            '❌ You cannot use `@everyone` as the live notification ping role.',
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
       * Make sure the selected creator is
       * actually in this server.
       */

      const creatorMember =
        await interaction.guild.members
          .fetch(creator.id)
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
        const channel =
          await addSocialFeedChannel(
            interaction.client,
            interaction.guild.id,
            {
              name,
              platform,
              identifier,

              /*
               * IMPORTANT:
               * This is the Discord account that
               * receives the live role.
               */

              discordUserId:
                creator.id,

              pingRoleId:
                pingRole?.id ||
                null,
            }
          );

        return interaction.editReply({
          content:
            `✅ Added **${channel.name}**.\n\n` +
            `${platformEmoji(channel.platform)} Platform: **${platformName(channel.platform)}**\n` +
            `📺 Channel: \`${channel.identifier}\`\n` +
            `👤 Discord creator: <@${channel.discordUserId}>\n` +
            `🔔 Ping role: ${
              channel.pingRoleId
                ? `<@&${channel.pingRoleId}>`
                : 'None'
            }\n\n` +
            `🎭 Live role: <@&${LIVE_ROLE_ID}>`,
        });
      } catch (error) {
        console.error(
          '[Social Feed] Add channel error:',
          error
        );

        return interaction.editReply({
          content:
            `❌ ${
              error.message ||
              'Failed to add channel.'
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
            '❌ There are no configured social media channels.',
          flags:
            MessageFlags.Ephemeral,
        });
      }

      /*
       * Discord select menus can have a maximum
       * of 25 options.
       */

      const options =
        channels
          .slice(0, 25)
          .map(
            channel =>
              new StringSelectMenuOptionBuilder()
                .setLabel(
                  channel.name.slice(
                    0,
                    100
                  )
                )
                .setDescription(
                  `${platformName(channel.platform)} • ${channel.identifier}`.slice(
                    0,
                    100
                  )
                )
                .setValue(
                  channel.id
                )
                .setEmoji(
                  platformEmoji(
                    channel.platform
                  )
                )
          );

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `social_remove_${interaction.user.id}`
          )
          .setPlaceholder(
            'Select a channel to remove...'
          )
          .addOptions(
            options
          );

      return interaction.reply({
        content:
          '**🗑️ Remove Social Channel**\nSelect the channel you want to remove:',
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            ),
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
            interaction.guild,
            channels
          ),
        ],
        flags:
          MessageFlags.Ephemeral,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | Component handler
  |--------------------------------------------------------------------------
  */

  async handleComponent(
    interaction
  ) {
    if (
      !interaction.isStringSelectMenu()
    ) {
      return false;
    }

    if (
      !interaction.customId.startsWith(
        'social_remove_'
      )
    ) {
      return false;
    }

    const ownerId =
      interaction.customId.replace(
        'social_remove_',
        ''
      );

    if (
      interaction.user.id !==
      ownerId
    ) {
      await interaction.reply({
        content:
          '❌ Only the administrator who opened this menu can use it.',
        flags:
          MessageFlags.Ephemeral,
      });

      return true;
    }

    const channelId =
      interaction.values[0];

    await interaction.deferUpdate();

    try {
      const removed =
        await removeSocialFeedChannel(
          interaction.client,
          interaction.guild.id,
          channelId
        );

      if (!removed) {
        await interaction.editReply({
          content:
            '❌ That channel no longer exists in the configuration.',
          embeds: [],
          components: [],
        });

        return true;
      }

      /*
       * If the creator was live, immediately remove
       * the fixed live role.
       */

      if (
        removed.discordUserId
      ) {
        const member =
          await interaction.guild.members
            .fetch(
              removed.discordUserId
            )
            .catch(
              () => null
            );

        if (
          member &&
          member.roles.cache.has(
            LIVE_ROLE_ID
          )
        ) {
          await member.roles
            .remove(
              LIVE_ROLE_ID,
              `Removed social live channel: ${removed.name}`
            )
            .catch(
              error =>
                console.error(
                  '[Social Feed] Failed removing live role after channel removal:',
                  error
                )
            );
        }
      }

      await interaction.editReply({
        content:
          `✅ Removed **${removed.name}** (${platformName(removed.platform)}).`,
        embeds: [],
        components: [],
      });

      return true;
    } catch (error) {
      console.error(
        '[Social Feed] Remove channel error:',
        error
      );

      await interaction.editReply({
        content:
          '❌ Failed to remove the channel.',
        embeds: [],
        components: [],
      });

      return true;
    }
  },
};
