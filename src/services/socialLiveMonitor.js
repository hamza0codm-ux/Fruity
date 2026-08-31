/*
|--------------------------------------------------------------------------
| Social Media Live Monitor
|--------------------------------------------------------------------------
|
| Checks configured Twitch + YouTube channels.
|
| LIVE:
|   - Adds LIVE_ROLE_ID to the configured creator
|   - Sends a notification to the Live channel
|   - Optionally mentions the configured ping role
|
| OFFLINE:
|   - Removes LIVE_ROLE_ID
|
|--------------------------------------------------------------------------
*/

import {
  EmbedBuilder,
} from 'discord.js';

import {
  getSocialFeedChannels,
  updateSocialFeedLiveState,
  LIVE_ROLE_ID,
} from './socialFeedConfig.js';

const CHECK_INTERVAL =
  60 * 1000;

/*
|--------------------------------------------------------------------------
| Runtime protection
|--------------------------------------------------------------------------
*/

let monitorStarted = false;
let monitorTimer = null;

const checkingGuilds =
  new Set();

/*
|--------------------------------------------------------------------------
| Twitch token cache
|--------------------------------------------------------------------------
*/

let twitchAccessToken = null;
let twitchTokenExpiresAt = 0;

/*
|--------------------------------------------------------------------------
| Fetch JSON helper
|--------------------------------------------------------------------------
*/

async function fetchJson(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      options
    );

  if (
    !response.ok
  ) {
    const text =
      await response.text()
        .catch(
          () => ''
        );

    throw new Error(
      `HTTP ${response.status}: ${text.slice(
        0,
        300
      )}`
    );
  }

  return response.json();
}

/*
|--------------------------------------------------------------------------
| Twitch authentication
|--------------------------------------------------------------------------
*/

async function getTwitchAccessToken() {
  const clientId =
    process.env.TWITCH_CLIENT_ID;

  const clientSecret =
    process.env.TWITCH_CLIENT_SECRET;

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new Error(
      'TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET is missing.'
    );
  }

  if (
    twitchAccessToken &&
    Date.now() <
      twitchTokenExpiresAt - 60_000
  ) {
    return twitchAccessToken;
  }

  const url =
    new URL(
      'https://id.twitch.tv/oauth2/token'
    );

  url.searchParams.set(
    'client_id',
    clientId
  );

  url.searchParams.set(
    'client_secret',
    clientSecret
  );

  url.searchParams.set(
    'grant_type',
    'client_credentials'
  );

  const data =
    await fetchJson(
      url.toString(),
      {
        method: 'POST',
      }
    );

  twitchAccessToken =
    data.access_token;

  twitchTokenExpiresAt =
    Date.now() +
    Number(
      data.expires_in || 3600
    ) *
      1000;

  return twitchAccessToken;
}

/*
|--------------------------------------------------------------------------
| Twitch live check
|--------------------------------------------------------------------------
*/

async function checkTwitch(
  identifier
) {
  const clientId =
    process.env.TWITCH_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      'TWITCH_CLIENT_ID is missing.'
    );
  }

  const token =
    await getTwitchAccessToken();

  const url =
    new URL(
      'https://api.twitch.tv/helix/streams'
    );

  url.searchParams.set(
    'user_login',
    identifier
  );

  const data =
    await fetchJson(
      url.toString(),
      {
        headers: {
          'Client-ID':
            clientId,

          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  const stream =
    data?.data?.[0];

  if (!stream) {
    return {
      live: false,
    };
  }

  return {
    live: true,

    title:
      stream.title ||
      'Live on Twitch',

    url:
      `https://twitch.tv/${identifier}`,

    game:
      stream.game_name ||
      null,

    viewerCount:
      Number(
        stream.viewer_count || 0
      ),
  };
}

/*
|--------------------------------------------------------------------------
| YouTube live check
|--------------------------------------------------------------------------
*/

async function checkYouTube(
  identifier
) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY is missing.'
    );
  }

  /*
   * Supports:
   *
   * UCxxxxxxxx
   * @handle
   * https://youtube.com/@handle
   */

  let channelId =
    identifier;

  const clean =
    identifier
      .replace(
        /^https?:\/\/(www\.)?youtube\.com\//i,
        ''
      )
      .trim();

  /*
   * If this is already a channel ID.
   */

  if (
    /^UC[a-zA-Z0-9_-]{20,}$/.test(
      clean
    )
  ) {
    channelId =
      clean;
  } else {
    /*
     * Resolve a YouTube handle.
     */

    const handle =
      clean.startsWith('@')
        ? clean
        : `@${clean}`;

    const searchUrl =
      new URL(
        'https://www.googleapis.com/youtube/v3/channels'
      );

    searchUrl.searchParams.set(
      'part',
      'id'
    );

    searchUrl.searchParams.set(
      'forHandle',
      handle
    );

    searchUrl.searchParams.set(
      'key',
      apiKey
    );

    const channelData =
      await fetchJson(
        searchUrl.toString()
      );

    channelId =
      channelData?.items?.[0]?.id;

    if (!channelId) {
      return {
        live: false,
      };
    }
  }

  /*
   * Find active live broadcasts.
   */

  const liveUrl =
    new URL(
      'https://www.googleapis.com/youtube/v3/search'
    );

  liveUrl.searchParams.set(
    'part',
    'snippet'
  );

  liveUrl.searchParams.set(
    'channelId',
    channelId
  );

  liveUrl.searchParams.set(
    'eventType',
    'live'
  );

  liveUrl.searchParams.set(
    'type',
    'video'
  );

  liveUrl.searchParams.set(
    'maxResults',
    '1'
  );

  liveUrl.searchParams.set(
    'key',
    apiKey
  );

  const data =
    await fetchJson(
      liveUrl.toString()
    );

  const video =
    data?.items?.[0];

  if (!video) {
    return {
      live: false,
    };
  }

  const videoId =
    video.id?.videoId;

  if (!videoId) {
    return {
      live: false,
    };
  }

  return {
    live: true,

    title:
      video.snippet?.title ||
      'Live on YouTube',

    url:
      `https://youtube.com/watch?v=${videoId}`,

    game: null,

    viewerCount: 0,
  };
}

/*
|--------------------------------------------------------------------------
| Check platform
|--------------------------------------------------------------------------
*/

async function checkChannel(
  channel
) {
  if (
    channel.platform ===
    'twitch'
  ) {
    return checkTwitch(
      channel.identifier
    );
  }

  if (
    channel.platform ===
    'youtube'
  ) {
    return checkYouTube(
      channel.identifier
    );
  }

  return {
    live: false,
  };
}

/*
|--------------------------------------------------------------------------
| Give live role
|--------------------------------------------------------------------------
*/

async function addLiveRole(
  guild,
  channel
) {
  const role =
    guild.roles.cache.get(
      LIVE_ROLE_ID
    ) ||
    await guild.roles.fetch(
      LIVE_ROLE_ID
    ).catch(
      () => null
    );

  if (!role) {
    console.error(
      `[Social Feed] Live role ${LIVE_ROLE_ID} was not found in ${guild.name}.`
    );

    return false;
  }

  /*
   * The role is a guild-wide "currently live" role.
   *
   * Since the role represents any configured creator
   * being live, it is added to the configured creator's
   * Discord member only when that member can be resolved.
   *
   * If the configured name is not a Discord user, the role
   * cannot be assigned to the creator.
   */

  let member = null;

  /*
   * Try Discord user ID first.
   */

  if (
    /^\d{17,20}$/.test(
      channel.identifier
    )
  ) {
    member =
      guild.members.cache.get(
        channel.identifier
      ) ||
      await guild.members
        .fetch(
          channel.identifier
        )
        .catch(
          () => null
        );
  }

  /*
   * Try matching the configured name against guild members.
   */

  if (!member) {
    const target =
      channel.name
        .toLowerCase()
        .replace(
          /^@/,
          ''
        );

    member =
      guild.members.cache.find(
        m =>
          m.user.username
            .toLowerCase() ===
            target
      ) ||
      guild.members.cache.find(
        m =>
          m.displayName
            .toLowerCase() ===
            target
      );
  }

  if (!member) {
    console.warn(
      `[Social Feed] Could not find Discord member for "${channel.name}".`
    );

    return false;
  }

  if (
    member.roles.cache.has(
      LIVE_ROLE_ID
    )
  ) {
    return true;
  }

  try {
    await member.roles.add(
      role,
      `Live notification: ${channel.name} is live`
    );

    console.log(
      `[Social Feed] Added live role to ${member.user.tag} for ${channel.name}.`
    );

    return true;
  } catch (error) {
    console.error(
      `[Social Feed] Failed to add live role for ${channel.name}:`,
      error
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Remove live role
|--------------------------------------------------------------------------
*/

async function removeLiveRole(
  guild,
  channel
) {
  const role =
    guild.roles.cache.get(
      LIVE_ROLE_ID
    ) ||
    await guild.roles.fetch(
      LIVE_ROLE_ID
    ).catch(
      () => null
    );

  if (!role) {
    return false;
  }

  let member = null;

  if (
    /^\d{17,20}$/.test(
      channel.identifier
    )
  ) {
    member =
      guild.members.cache.get(
        channel.identifier
      ) ||
      await guild.members
        .fetch(
          channel.identifier
        )
        .catch(
          () => null
        );
  }

  if (!member) {
    const target =
      channel.name
        .toLowerCase()
        .replace(
          /^@/,
          ''
        );

    member =
      guild.members.cache.find(
        m =>
          m.user.username
            .toLowerCase() ===
            target
      ) ||
      guild.members.cache.find(
        m =>
          m.displayName
            .toLowerCase() ===
            target
      );
  }

  if (!member) {
    return false;
  }

  if (
    !member.roles.cache.has(
      LIVE_ROLE_ID
    )
  ) {
    return true;
  }

  try {
    await member.roles.remove(
      role,
      `Live notification ended: ${channel.name}`
    );

    console.log(
      `[Social Feed] Removed live role from ${member.user.tag}.`
    );

    return true;
  } catch (error) {
    console.error(
      `[Social Feed] Failed to remove live role for ${channel.name}:`,
      error
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Send live notification
|--------------------------------------------------------------------------
*/

async function sendLiveNotification(
  guild,
  channel,
  liveData
) {
  const liveChannel =
    guild.channels.cache.get(
      '1542878558274457691'
    );

  /*
   * IMPORTANT:
   *
   * 1542878558274457691 is the ROLE, not the channel.
   *
   * Therefore notification destination must be configured
   * separately.
   *
   * For now use:
   *
   * SOCIAL_LIVE_CHANNEL_ID
   *
   * from Railway variables.
   */

  const notificationChannelId =
    process.env.SOCIAL_LIVE_CHANNEL_ID;

  if (
    !notificationChannelId
  ) {
    console.warn(
      '[Social Feed] SOCIAL_LIVE_CHANNEL_ID is not configured.'
    );

    return false;
  }

  const notificationChannel =
    guild.channels.cache.get(
      notificationChannelId
    ) ||
    await guild.channels
      .fetch(
        notificationChannelId
      )
      .catch(
        () => null
      );

  if (
    !notificationChannel ||
    !notificationChannel.isTextBased()
  ) {
    console.warn(
      `[Social Feed] Live notification channel ${notificationChannelId} was not found.`
    );

    return false;
  }

  const embed =
    new EmbedBuilder()
      .setColor(
        0xF8D568
      )
      .setTitle(
        `🔴 ${channel.name} is LIVE!`
      )
      .setDescription(
        `**${channel.name}** has just gone live on **${
          channel.platform === 'twitch'
            ? 'Twitch'
            : 'YouTube'
        }**!\n\n` +
        `**${liveData.title || 'Live now'}**`
      )
      .addFields({
        name:
          'Watch now',
        value:
          `[Open stream](${liveData.url})`,
        inline: false,
      })
      .setTimestamp();

  const content =
    channel.pingRoleId
      ? `<@&${channel.pingRoleId}>`
      : null;

  await notificationChannel.send({
    content,
    embeds: [
      embed,
    ],
    allowedMentions: {
      roles:
        channel.pingRoleId
          ? [
              channel.pingRoleId,
            ]
          : [],
    },
  });

  return true;
}

/*
|--------------------------------------------------------------------------
| Check one guild
|--------------------------------------------------------------------------
*/

async function checkGuild(
  client,
  guild
) {
  if (
    checkingGuilds.has(
      guild.id
    )
  ) {
    return;
  }

  checkingGuilds.add(
    guild.id
  );

  try {
    const channels =
      await getSocialFeedChannels(
        client,
        guild.id
      );

    if (!channels.length) {
      return;
    }

    for (
      const channel of channels
    ) {
      try {
        const liveData =
          await checkChannel(
            channel
          );

        const wasLive =
          Boolean(
            channel.isLive
          );

        const isLive =
          Boolean(
            liveData.live
          );

        /*
         * OFFLINE -> LIVE
         */

        if (
          !wasLive &&
          isLive
        ) {
          console.log(
            `[Social Feed] ${channel.name} went LIVE.`
          );

          await addLiveRole(
            guild,
            channel
          );

          await sendLiveNotification(
            guild,
            channel,
            liveData
          );
        }

        /*
         * LIVE -> OFFLINE
         */

        if (
          wasLive &&
          !isLive
        ) {
          console.log(
            `[Social Feed] ${channel.name} went OFFLINE.`
          );

          await removeLiveRole(
            guild,
            channel
          );
        }

        /*
         * Save state.
         */

        if (
          wasLive !==
          isLive
        ) {
          await updateSocialFeedLiveState(
            client,
            guild.id,
            channel.id,
            isLive
          );
        }
      } catch (error) {
        console.error(
          `[Social Feed] Failed checking ${channel.name}:`,
          error
        );
      }
    }
  } finally {
    checkingGuilds.delete(
      guild.id
    );
  }
}

/*
|--------------------------------------------------------------------------
| Run monitor once
|--------------------------------------------------------------------------
*/

export async function runSocialLiveCheck(
  client
) {
  for (
    const guild of
    client.guilds.cache.values()
  ) {
    await checkGuild(
      client,
      guild
    );
  }
}

/*
|--------------------------------------------------------------------------
| Start monitor
|--------------------------------------------------------------------------
*/

export function startSocialLiveMonitor(
  client
) {
  if (
    monitorStarted
  ) {
    return;
  }

  monitorStarted =
    true;

  console.log(
    '[Social Feed] Live monitor started.'
  );

  /*
   * Run immediately.
   */

  runSocialLiveCheck(
    client
  ).catch(
    error =>
      console.error(
        '[Social Feed] Initial check failed:',
        error
      )
  );

  /*
   * Then check every minute.
   */

  monitorTimer =
    setInterval(
      () => {
        runSocialLiveCheck(
          client
        ).catch(
          error =>
            console.error(
              '[Social Feed] Scheduled check failed:',
              error
            )
        );
      },
      CHECK_INTERVAL
    );
}

/*
|--------------------------------------------------------------------------
| Stop monitor
|--------------------------------------------------------------------------
*/

export function stopSocialLiveMonitor() {
  if (
    monitorTimer
  ) {
    clearInterval(
      monitorTimer
    );

    monitorTimer =
      null;
  }

  monitorStarted =
    false;

  console.log(
    '[Social Feed] Live monitor stopped.'
  );
}
