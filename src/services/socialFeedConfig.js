/*
|--------------------------------------------------------------------------
| Social Media Live Feed Configuration
|--------------------------------------------------------------------------
|
| Stores the creators/channels configured through Discord commands.
|
| Supported platforms:
|   - Twitch
|   - YouTube
|   - TikTok
|
| The live role is intentionally fixed:
|
|   1542878558274457691
|
| That role is automatically added while a configured creator is live
| and removed when they go offline.
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

/*
|--------------------------------------------------------------------------
| Supported platforms
|--------------------------------------------------------------------------
*/

const SUPPORTED_PLATFORMS = [
  'twitch',
  'youtube',
  'tiktok',
];

/*
|--------------------------------------------------------------------------
| Normalise stored configuration
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
    .map(channel => ({
      id: String(
        channel.id || ''
      ),

      name: String(
        channel.name || ''
      ).trim(),

      platform: String(
        channel.platform || ''
      ).toLowerCase(),

      identifier: String(
        channel.identifier || ''
      ).trim(),

      pingRoleId:
        channel.pingRoleId
          ? String(
              channel.pingRoleId
            )
          : null,

      isLive: Boolean(
        channel.isLive
      ),

      lastChecked:
        channel.lastChecked
          ? Number(
              channel.lastChecked
            )
          : 0,
    }))
    .filter(channel =>
      channel.id &&
      channel.name &&
      SUPPORTED_PLATFORMS.includes(
        channel.platform
      ) &&
      channel.identifier
    );
}

/*
|--------------------------------------------------------------------------
| Get all configured social channels
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
| Save all configured social channels
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
| Add a channel
|--------------------------------------------------------------------------
*/

export async function addSocialFeedChannel(
  client,
  guildId,
  {
    name,
    platform,
    identifier,
    pingRoleId = null,
  }
) {
  const channels =
    await getSocialFeedChannels(
      client,
      guildId
    );

  const cleanPlatform =
    String(
      platform || ''
    ).toLowerCase();

  const cleanName =
    String(
      name || ''
    ).trim();

  const cleanIdentifier =
    String(
      identifier || ''
    ).trim();

  if (
    !cleanName ||
    !cleanIdentifier
  ) {
    throw new Error(
      'Channel name and identifier are required.'
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

  /*
   * Prevent duplicate creators.
   */

  const duplicate =
    channels.find(
      channel =>
        channel.platform ===
          cleanPlatform &&
        channel.identifier
          .toLowerCase() ===
          cleanIdentifier.toLowerCase()
    );

  if (duplicate) {
    throw new Error(
      `That ${cleanPlatform} channel is already configured as "${duplicate.name}".`
    );
  }

  /*
   * Each configured channel gets
   * its own internal ID.
   */

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

    identifier:
      cleanIdentifier,

    pingRoleId:
      pingRoleId
        ? String(
            pingRoleId
          )
        : null,

    /*
     * Runtime live state.
     */

    isLive:
      false,

    lastChecked:
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
| Remove a channel
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
| Update a configured channel
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

  /*
   * Update name
   */

  if (
    updates.name !== undefined
  ) {
    const newName =
      String(
        updates.name
      ).trim();

    if (!newName) {
      throw new Error(
        'Channel name cannot be empty.'
      );
    }

    channel.name =
      newName;
  }

  /*
   * Update platform
   */

  if (
    updates.platform !== undefined
  ) {
    const platform =
      String(
        updates.platform
      ).toLowerCase();

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

  /*
   * Update creator identifier
   */

  if (
    updates.identifier !== undefined
  ) {
    const identifier =
      String(
        updates.identifier
      ).trim();

    if (!identifier) {
      throw new Error(
        'Channel identifier cannot be empty.'
      );
    }

    channel.identifier =
      identifier;
  }

  /*
   * Update notification ping role.
   *
   * null / empty = no role ping.
   */

  if (
    updates.pingRoleId !== undefined
  ) {
    channel.pingRoleId =
      updates.pingRoleId
        ? String(
            updates.pingRoleId
          )
        : null;
  }

  /*
   * If platform or identifier changed,
   * make sure we didn't create a duplicate.
   */

  const duplicate =
    channels.find(
      item =>
        item.id !== channel.id &&
        item.platform ===
          channel.platform &&
        item.identifier
          .toLowerCase() ===
          channel.identifier.toLowerCase()
    );

  if (duplicate) {
    throw new Error(
      `That ${channel.platform} channel is already configured as "${duplicate.name}".`
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
| Find one configured channel
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
| Get supported platforms
|--------------------------------------------------------------------------
|
| Useful for commands such as:
|
| /add channel
|
|--------------------------------------------------------------------------
*/

export function getSupportedSocialPlatforms() {
  return [
    ...SUPPORTED_PLATFORMS,
  ];
}
