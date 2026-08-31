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

import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';

export const LIVE_ROLE_ID = '1542878558274457691';

const CONFIG_KEY = 'socialFeedChannels';

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
    .filter(channel => channel && typeof channel === 'object')
    .map(channel => ({
      id: String(channel.id || ''),
      name: String(channel.name || '').trim(),
      platform: String(channel.platform || '').toLowerCase(),
      identifier: String(channel.identifier || '').trim(),
      pingRoleId:
        channel.pingRoleId
          ? String(channel.pingRoleId)
          : null,
      isLive: Boolean(channel.isLive),
      lastChecked:
        channel.lastChecked
          ? Number(channel.lastChecked)
          : 0,
    }))
    .filter(channel =>
      channel.id &&
      channel.name &&
      (
        channel.platform === 'twitch' ||
        channel.platform === 'youtube'
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
    cleanPlatform !== 'twitch' &&
    cleanPlatform !== 'youtube'
  ) {
    throw new Error(
      'Platform must be Twitch or YouTube.'
    );
  }

  /*
   * Prevent duplicate creators.
   */

  const duplicate =
    channels.find(channel =>
      channel.platform === cleanPlatform &&
      channel.identifier.toLowerCase() ===
        cleanIdentifier.toLowerCase()
    );

  if (duplicate) {
    throw new Error(
      `That ${cleanPlatform} channel is already configured as "${duplicate.name}".`
    );
  }

  /*
   * Each configured channel gets its own internal ID.
   */

  const id =
    `${cleanPlatform}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const channel = {
    id,
    name: cleanName,
    platform: cleanPlatform,
    identifier: cleanIdentifier,
    pingRoleId:
      pingRoleId
        ? String(pingRoleId)
        : null,

    /*
     * This is runtime state.
     * It is persisted so a restart doesn't accidentally
     * cause the role to remain assigned.
     */

    isLive: false,
    lastChecked: 0,
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

  if (
    updates.name !== undefined
  ) {
    channel.name =
      String(
        updates.name
      ).trim();
  }

  if (
    updates.platform !== undefined
  ) {
    const platform =
      String(
        updates.platform
      ).toLowerCase();

    if (
      platform !== 'twitch' &&
      platform !== 'youtube'
    ) {
      throw new Error(
        'Platform must be Twitch or YouTube.'
      );
    }

    channel.platform =
      platform;
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
    updates.pingRoleId !== undefined
  ) {
    channel.pingRoleId =
      updates.pingRoleId
        ? String(
            updates.pingRoleId
          )
        : null;
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
    ) || null
  );
}

