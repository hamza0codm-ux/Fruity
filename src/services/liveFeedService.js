import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';

export const DEFAULT_LIVE_ROLE_ID =
  '1542878558274457691';

export const DEFAULT_LIVE_FEED = {
  channels: [],
};

function normalizePlatform(platform) {
  const value =
    String(platform || '').trim().toLowerCase();

  if (value === 'twitch') {
    return 'twitch';
  }

  if (
    value === 'youtube' ||
    value === 'yt'
  ) {
    return 'youtube';
  }

  return null;
}

function normalizeChannelInput({
  name,
  platform,
  identifier,
  pingRoleId = null,
}) {
  const normalizedPlatform =
    normalizePlatform(platform);

  if (!normalizedPlatform) {
    throw new Error(
      'Platform must be Twitch or YouTube.'
    );
  }

  const cleanName =
    String(name || '').trim();

  const cleanIdentifier =
    String(identifier || '').trim();

  if (!cleanName) {
    throw new Error(
      'A channel name is required.'
    );
  }

  if (!cleanIdentifier) {
    throw new Error(
      'A Twitch/YouTube channel URL or ID is required.'
    );
  }

  return {
    id:
      `${normalizedPlatform}:${cleanIdentifier.toLowerCase()}`,

    name:
      cleanName,

    platform:
      normalizedPlatform,

    identifier:
      cleanIdentifier,

    pingRoleId:
      pingRoleId || null,

    live:
      false,

    lastStreamId:
      null,

    lastLiveAt:
      null,

    lastCheckedAt:
      null,
  };
}

async function readFeedConfig(
  client,
  guildId
) {
  const config =
    await getGuildConfig(
      client,
      guildId
    );

  const existing =
    config.liveFeed;

  if (
    !existing ||
    typeof existing !== 'object'
  ) {
    return {
      channels: [],
    };
  }

  return {
    channels:
      Array.isArray(existing.channels)
        ? existing.channels
        : [],
  };
}

async function writeFeedConfig(
  client,
  guildId,
  feed
) {
  const config =
    await getGuildConfig(
      client,
      guildId
    );

  return await setGuildConfig(
    client,
    guildId,
    {
      ...config,

      liveFeed: {
        channels:
          Array.isArray(feed.channels)
            ? feed.channels
            : [],
      },
    }
  );
}

export async function getLiveFeedChannels(
  client,
  guildId
) {
  const feed =
    await readFeedConfig(
      client,
      guildId
    );

  return feed.channels;
}

export async function addLiveFeedChannel({
  client,
  guildId,
  name,
  platform,
  identifier,
  pingRoleId = null,
}) {
  const feed =
    await readFeedConfig(
      client,
      guildId
    );

  const channel =
    normalizeChannelInput({
      name,
      platform,
      identifier,
      pingRoleId,
    });

  const duplicate =
    feed.channels.find(
      existing =>
        existing.platform ===
          channel.platform &&
        String(existing.identifier)
          .toLowerCase() ===
          String(channel.identifier)
            .toLowerCase()
    );

  if (duplicate) {
    throw new Error(
      `That ${channel.platform} channel is already configured as **${duplicate.name}**.`
    );
  }

  feed.channels.push(
    channel
  );

  await writeFeedConfig(
    client,
    guildId,
    feed
  );

  return channel;
}

export async function removeLiveFeedChannel({
  client,
  guildId,
  channelId,
}) {
  const feed =
    await readFeedConfig(
      client,
      guildId
    );

  const index =
    feed.channels.findIndex(
      channel =>
        channel.id === channelId
    );

  if (index === -1) {
    return null;
  }

  const [
    removed
  ] =
    feed.channels.splice(
      index,
      1
    );

  await writeFeedConfig(
    client,
    guildId,
    feed
  );

  return removed;
}

export async function updateLiveFeedChannel(
  client,
  guildId,
  channelId,
  updates
) {
  const feed =
    await readFeedConfig(
      client,
      guildId
    );

  const channel =
    feed.channels.find(
      item =>
        item.id === channelId
    );

  if (!channel) {
    return null;
  }

  Object.assign(
    channel,
    updates
  );

  await writeFeedConfig(
    client,
    guildId,
    feed
  );

  return channel;
}

export async function findLiveFeedChannel(
  client,
  guildId,
  channelId
) {
  const channels =
    await getLiveFeedChannels(
      client,
      guildId
    );

  return (
    channels.find(
      channel =>
        channel.id === channelId
    ) ||
    null
  );
}

export function getDefaultLiveRoleId() {
  return DEFAULT_LIVE_ROLE_ID;
}
