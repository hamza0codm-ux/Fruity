/*
|--------------------------------------------------------------------------
| Social Media Feed Configuration
|--------------------------------------------------------------------------
|
| Stores configurable social media feeds.
|
| Supported:
|   - Twitch
|   - YouTube
|   - TikTok
|
| Notification types:
|   - live
|   - posts
|   - both
|
|--------------------------------------------------------------------------
*/

import {
  getGuildConfig,
  setGuildConfig,
} from './config/guildConfig.js';

export const LIVE_ROLE_ID =
  '1542878558274457691';

const CONFIG_KEY =
  'socialFeedChannels';

const SUPPORTED_PLATFORMS = [
  'twitch',
  'youtube',
  'tiktok',
];

const SUPPORTED_NOTIFICATION_TYPES = [
  'live',
  'posts',
  'both',
];

/*
|--------------------------------------------------------------------------
| Normalise channels
|--------------------------------------------------------------------------
*/

function normaliseChannels(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      channel =>
        channel &&
        typeof channel === 'object'
    )
    .map(channel => {
      const platform =
        String(
          channel.platform || ''
        )
          .trim()
          .toLowerCase();

      const notificationType =
        SUPPORTED_NOTIFICATION_TYPES.includes(
          String(
            channel.notificationType || ''
          ).toLowerCase()
        )
          ? String(
              channel.notificationType
            ).toLowerCase()
          : 'live';

      return {
        id: String(
          channel.id || ''
        ),

        name: String(
          channel.name || ''
        ).trim(),

        platform,

        /*
         * New system stores the complete
         * social media URL.
         */
        link: String(
          channel.link ||
          channel.url ||
          ''
        ).trim(),

        /*
         * Keep identifier for backwards
         * compatibility with existing feeds.
         */
        identifier: String(
          channel.identifier ||
          ''
        ).trim(),

        notificationType,

        liveChannelId:
          channel.liveChannelId
            ? String(
                channel.liveChannelId
              )
            : null,

        postChannelId:
          channel.postChannelId
            ? String(
                channel.postChannelId
              )
            : null,

        discordUserId:
          channel.discordUserId
            ? String(
                channel.discordUserId
              )
            : null,

        pingRoleId:
          channel.pingRoleId
            ? String(
                channel.pingRoleId
              )
            : null,

        /*
         * Runtime live state.
         */
        isLive: Boolean(
          channel.isLive
        ),

        lastChecked:
          channel.lastChecked
            ? Number(
                channel.lastChecked
              )
            : 0,

        /*
         * Runtime post state.
         */
        lastPostId:
          channel.lastPostId
            ? String(
                channel.lastPostId
              )
            : null,

        lastPostAt:
          channel.lastPostAt
            ? Number(
                channel.lastPostAt
              )
            : 0,
      };
    })
    .filter(channel =>
      channel.id &&
      channel.name &&
      SUPPORTED_PLATFORMS.includes(
        channel.platform
      ) &&
      (
        channel.link ||
        channel.identifier
      )
    );
}

/*
|--------------------------------------------------------------------------
| Get channels
|--------------------------------------------------------------------------
*/

export async function getSocialFeedChannels(
  client,
  guildId
) {
  const config =
    await getGuildConfig(
      client,
      guildId
    );

  return normaliseChannels(
    config?.[CONFIG_KEY]
  );
}

/*
|--------------------------------------------------------------------------
| Save channels
|--------------------------------------------------------------------------
*/

export async function saveSocialFeedChannels(
  client,
  guildId,
  channels
) {
  const cleanChannels =
    normaliseChannels(
      channels
    );

  await setGuildConfig(
    client,
    guildId,
    CONFIG_KEY,
    cleanChannels
  );

  return cleanChannels;
}

/*
|--------------------------------------------------------------------------
| Add channel
|--------------------------------------------------------------------------
*/

export async function addSocialFeedChannel(
  client,
  guildId,
  {
    name,
    platform,
    link,
    identifier = '',
    notificationType = 'live',
    liveChannelId = null,
    postChannelId = null,
    discordUserId = null,
    pingRoleId = null,
  }
) {
  const channels =
    await getSocialFeedChannels(
      client,
      guildId
    );

  const cleanName =
    String(
      name || ''
    ).trim();

  const cleanPlatform =
    String(
      platform || ''
    )
      .trim()
      .toLowerCase();

  const cleanLink =
    String(
      link || ''
    ).trim();

  const cleanIdentifier =
    String(
      identifier || ''
    ).trim();

  const cleanType =
    String(
      notificationType || 'live'
    )
      .trim()
      .toLowerCase();

  if (!cleanName) {
    throw new Error(
      'A social feed name is required.'
    );
  }

  if (
    !SUPPORTED_PLATFORMS.includes(
      cleanPlatform
    )
  ) {
    throw new Error(
      'Platform must be Twitch, YouTube, or TikTok.'
    );
  }

  if (
    !cleanLink &&
    !cleanIdentifier
  ) {
    throw new Error(
      'A platform link is required.'
    );
  }

  if (
    !SUPPORTED_NOTIFICATION_TYPES.includes(
      cleanType
    )
  ) {
    throw new Error(
      'Notification type must be Live, Posts, or Both.'
    );
  }

  if (
    (
      cleanType === 'live' ||
      cleanType === 'both'
    ) &&
    !liveChannelId
  ) {
    throw new Error(
      'A live notification channel is required.'
    );
  }

  if (
    (
      cleanType === 'posts' ||
      cleanType === 'both'
    ) &&
    !postChannelId
  ) {
    throw new Error(
      'A post notification channel is required.'
    );
  }

  /*
   * Prevent duplicate platform links.
   */
  const duplicate =
    channels.find(channel => {
      if (
        channel.platform !==
        cleanPlatform
      ) {
        return false;
      }

      const existingLink =
        String(
          channel.link ||
          channel.identifier ||
          ''
        )
          .trim()
          .toLowerCase();

      const newLink =
        String(
          cleanLink ||
          cleanIdentifier ||
          ''
        )
          .trim()
          .toLowerCase();

      return (
        existingLink ===
        newLink
      );
    });

  if (duplicate) {
    throw new Error(
      `That ${cleanPlatform} account is already configured as "${duplicate.name}".`
    );
  }

  const id =
    `${cleanPlatform}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const channel = {
    id,

    name:
      cleanName,

    platform:
      cleanPlatform,

    link:
      cleanLink,

    identifier:
      cleanIdentifier,

    notificationType:
      cleanType,

    liveChannelId:
      liveChannelId
        ? String(
            liveChannelId
          )
        : null,

    postChannelId:
      postChannelId
        ? String(
            postChannelId
          )
        : null,

    discordUserId:
      discordUserId
        ? String(
            discordUserId
          )
        : null,

    pingRoleId:
      pingRoleId
        ? String(
            pingRoleId
          )
        : null,

    isLive:
      false,

    lastChecked:
      0,

    lastPostId:
      null,

    lastPostAt:
      0,
  };

  channels.push(
    channel
  );

  await saveSocialFeedChannels(
    client,
    guildId,
    channels
  );

  return channel;
}

/*
|--------------------------------------------------------------------------
| Remove channel
|--------------------------------------------------------------------------
*/

export async function removeSocialFeedChannel(
  client,
  guildId,
  channelId
) {
  const channels =
    await getSocialFeedChannels(
      client,
      guildId
    );

  const index =
    channels.findIndex(
      channel =>
        channel.id ===
        String(channelId)
    );

  if (index === -1) {
    return null;
  }

  const [
    removed
  ] =
    channels.splice(
      index,
      1
    );

  await saveSocialFeedChannels(
    client,
    guildId,
    channels
  );

  return removed;
}

/*
|--------------------------------------------------------------------------
| Update channel
|--------------------------------------------------------------------------
*/

export async function updateSocialFeedChannel(
  client,
  guildId,
  channelId,
  updates
) {
  const channels =
    await getSocialFeedChannels(
      client,
      guildId
    );

  const channel =
    channels.find(
      item =>
        item.id ===
        String(channelId)
    );

  if (!channel) {
    return null;
  }

  if (
    updates.name !== undefined
  ) {
    const name =
      String(
        updates.name
      ).trim();

    if (!name) {
      throw new Error(
        'Feed name cannot be empty.'
      );
    }

    channel.name =
      name;
  }

  if (
    updates.platform !== undefined
  ) {
    const platform =
      String(
        updates.platform
      )
        .trim()
        .toLowerCase();

    if (
      !SUPPORTED_PLATFORMS.includes(
        platform
      )
    ) {
      throw new Error(
        'Platform must be Twitch, YouTube, or TikTok.'
      );
    }

    channel.platform =
      platform;
  }

  if (
    updates.link !== undefined
  ) {
    const link =
      String(
        updates.link
      ).trim();

    if (!link) {
      throw new Error(
        'Platform link cannot be empty.'
      );
    }

    channel.link =
      link;
  }

  if (
    updates.identifier !== undefined
  ) {
    channel.identifier =
      String(
        updates.identifier
      ).trim();
  }

  if (
    updates.notificationType !==
    undefined
  ) {
    const type =
      String(
        updates.notificationType
      )
        .trim()
        .toLowerCase();

    if (
      !SUPPORTED_NOTIFICATION_TYPES.includes(
        type
      )
    ) {
      throw new Error(
        'Notification type must be Live, Posts, or Both.'
      );
    }

    channel.notificationType =
      type;
  }

  if (
    updates.liveChannelId !==
    undefined
  ) {
    channel.liveChannelId =
      updates.liveChannelId
        ? String(
            updates.liveChannelId
          )
        : null;
  }

  if (
    updates.postChannelId !==
    undefined
  ) {
    channel.postChannelId =
      updates.postChannelId
        ? String(
            updates.postChannelId
          )
        : null;
  }

  if (
    updates.discordUserId !==
    undefined
  ) {
    channel.discordUserId =
      updates.discordUserId
        ? String(
            updates.discordUserId
          )
        : null;
  }

  if (
    updates.pingRoleId !==
    undefined
  ) {
    channel.pingRoleId =
      updates.pingRoleId
        ? String(
            updates.pingRoleId
          )
        : null;
  }

  /*
   * Check duplicates.
   */
  const channelsLink =
    String(
      channel.link ||
      channel.identifier ||
      ''
    )
      .trim()
      .toLowerCase();

  const duplicate =
    channels.find(
      item =>
        item.id !== channel.id &&
        item.platform ===
          channel.platform &&
        String(
          item.link ||
          item.identifier ||
          ''
        )
          .trim()
          .toLowerCase() ===
          channelsLink
    );

  if (duplicate) {
    throw new Error(
      `That ${channel.platform} account is already configured as "${duplicate.name}".`
    );
  }

  await saveSocialFeedChannels(
    client,
    guildId,
    channels
  );

  return channel;
}

/*
|--------------------------------------------------------------------------
| Update live state
|--------------------------------------------------------------------------
*/

export async function updateSocialFeedLiveState(
  client,
  guildId,
  channelId,
  isLive
) {
  const channels =
    await getSocialFeedChannels(
      client,
      guildId
    );

  const channel =
    channels.find(
      item =>
        item.id ===
        String(channelId)
    );

  if (!channel) {
    return null;
  }

  channel.isLive =
    Boolean(
      isLive
    );

  channel.lastChecked =
    Date.now();

  await saveSocialFeedChannels(
    client,
    guildId,
    channels
  );

  return channel;
}

/*
|--------------------------------------------------------------------------
| Update post state
|--------------------------------------------------------------------------
*/

export async function updateSocialFeedPostState(
  client,
  guildId,
  channelId,
  {
    lastPostId = null,
    lastPostAt = 0,
  } = {}
) {
  const channels =
    await getSocialFeedChannels(
      client,
      guildId
    );

  const channel =
    channels.find(
      item =>
        item.id ===
        String(channelId)
    );

  if (!channel) {
    return null;
  }

  channel.lastPostId =
    lastPostId
      ? String(lastPostId)
      : null;

  channel.lastPostAt =
    Number(lastPostAt) || 0;

  await saveSocialFeedChannels(
    client,
    guildId,
    channels
  );

  return channel;
}

/*
|--------------------------------------------------------------------------
| Find channel
|--------------------------------------------------------------------------
*/

export async function findSocialFeedChannel(
  client,
  guildId,
  channelId
) {
  const channels =
    await getSocialFeedChannels(
      client,
      guildId
    );

  return (
    channels.find(
      channel =>
        channel.id ===
        String(channelId)
    ) ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| Supported platforms
|--------------------------------------------------------------------------
*/

export function getSupportedSocialPlatforms() {
  return [
    ...SUPPORTED_PLATFORMS,
  ];
}

/*
|--------------------------------------------------------------------------
| Supported notification types
|--------------------------------------------------------------------------
*/

export function getSupportedSocialNotificationTypes() {
  return [
    ...SUPPORTED_NOTIFICATION_TYPES,
  ];
}
