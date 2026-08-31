// src/services/socialLiveMonitor.js

import { EmbedBuilder } from 'discord.js';

import {
  getSocialFeedChannels,
  updateSocialFeedLiveState,
  LIVE_ROLE_ID,
} from './socialFeedConfig.js';

const CHECK_INTERVAL = 60 * 1000;

let monitorStarted = false;
let monitorTimer = null;

const checkingGuilds = new Set();

/*
|--------------------------------------------------------------------------
| Twitch token cache
|--------------------------------------------------------------------------
*/

let twitchAccessToken = null;
let twitchTokenExpiresAt = 0;

/*
|--------------------------------------------------------------------------
| JSON helper
|--------------------------------------------------------------------------
*/

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text().catch(() => '');

    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 300)}`
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
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET is missing.'
    );
  }

  if (
    twitchAccessToken &&
    Date.now() < twitchTokenExpiresAt - 60_000
  ) {
    return twitchAccessToken;
  }

  const url = new URL(
    'https://id.twitch.tv/oauth2/token'
  );

  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const data = await fetchJson(url.toString(), {
    method: 'POST',
  });

  twitchAccessToken = data.access_token;

  twitchTokenExpiresAt =
    Date.now() +
    Number(data.expires_in || 3600) * 1000;

  return twitchAccessToken;
}

/*
|--------------------------------------------------------------------------
| Twitch
|--------------------------------------------------------------------------
*/

async function checkTwitch(identifier) {
  const clientId = process.env.TWITCH_CLIENT_ID;

  if (!clientId) {
    throw new Error('TWITCH_CLIENT_ID is missing.');
  }

  const token = await getTwitchAccessToken();

  const url = new URL(
    'https://api.twitch.tv/helix/streams'
  );

  url.searchParams.set(
    'user_login',
    String(identifier).replace(/^@/, '').trim()
  );

  const data = await fetchJson(url.toString(), {
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
    },
  });

  const stream = data?.data?.[0];

  if (!stream) {
    return {
      live: false,
    };
  }

  return {
    live: true,
    title: stream.title || 'Live on Twitch',
    url: `https://twitch.tv/${String(identifier).replace(/^@/, '')}`,
    game: stream.game_name || null,
    viewerCount: Number(stream.viewer_count || 0),
  };
}

/*
|--------------------------------------------------------------------------
| YouTube
|--------------------------------------------------------------------------
*/

async function checkYouTube(identifier) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is missing.');
  }

  const original = String(identifier).trim();

  let clean = original
    .replace(
      /^https?:\/\/(www\.)?youtube\.com\//i,
      ''
    )
    .replace(
      /^https?:\/\/youtu\.be\//i,
      ''
    )
    .trim();

  let channelId = null;

  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(clean)) {
    channelId = clean;
  } else {
    const handle =
      clean.startsWith('@')
        ? clean
        : `@${clean}`;

    const searchUrl = new URL(
      'https://www.googleapis.com/youtube/v3/channels'
    );

    searchUrl.searchParams.set('part', 'id');
    searchUrl.searchParams.set('forHandle', handle);
    searchUrl.searchParams.set('key', apiKey);

    const channelData =
      await fetchJson(searchUrl.toString());

    channelId =
      channelData?.items?.[0]?.id || null;
  }

  if (!channelId) {
    return {
      live: false,
    };
  }

  const liveUrl = new URL(
    'https://www.googleapis.com/youtube/v3/search'
  );

  liveUrl.searchParams.set('part', 'snippet');
  liveUrl.searchParams.set('channelId', channelId);
  liveUrl.searchParams.set('eventType', 'live');
  liveUrl.searchParams.set('type', 'video');
  liveUrl.searchParams.set('maxResults', '1');
  liveUrl.searchParams.set('key', apiKey);

  const data =
    await fetchJson(liveUrl.toString());

  const video = data?.items?.[0];

  if (!video) {
    return {
      live: false,
    };
  }

  const videoId = video.id?.videoId;

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
| TikTok
|--------------------------------------------------------------------------
|
| TikTok does not provide a simple public "is this creator live?"
| endpoint like Twitch.
|
| This implementation checks the creator's TikTok page and looks
| for live indicators in the returned HTML.
|
| IMPORTANT:
| TikTok may change its HTML or block automated requests.
| If TikTok blocks the request, the monitor simply reports the
| creator as offline instead of crashing the monitor.
|--------------------------------------------------------------------------
*/

async function checkTikTok(identifier) {
  const username = String(identifier)
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '')
    .split(/[/?#]/)[0];

  if (!username) {
    return {
      live: false,
    };
  }

  const url =
    `https://www.tiktok.com/@${encodeURIComponent(username)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language':
          'en-US,en;q=0.9',
        Referer:
          'https://www.tiktok.com/',
      },
    });

    if (!response.ok) {
      console.warn(
        `[Social Feed] TikTok returned HTTP ${response.status} for @${username}.`
      );

      return {
        live: false,
      };
    }

    const html = await response.text();

    const lower = html.toLowerCase();

    /*
     * TikTok has used several different live indicators.
     * Check multiple possibilities rather than relying on
     * one exact HTML string.
     */

    const liveIndicators = [
      '"islive":true',
      '"is_live":true',
      '"islive": true',
      '"is_live": true',
      '"live":true',
      '"live": true',
      '"livestatus":1',
      '"live_status":1',
      '"livestatus": 1',
      '"live_status": 1',
    ];

    const isLive =
      liveIndicators.some(
        indicator =>
          lower.includes(indicator)
      );

    if (!isLive) {
      return {
        live: false,
      };
    }

    /*
     * Try to extract a title if TikTok exposes one.
     */

    let title = 'Live on TikTok';

    const titlePatterns = [
      /"roomtitle":"([^"]+)"/i,
      /"room_title":"([^"]+)"/i,
      /"livetitle":"([^"]+)"/i,
      /"live_title":"([^"]+)"/i,
    ];

    for (const pattern of titlePatterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        title = match[1]
          .replace(/\\"/g, '"')
          .replace(/\\u0026/g, '&');

        break;
      }
    }

    return {
      live: true,
      title,
      url: `https://www.tiktok.com/@${username}/live`,
      game: null,
      viewerCount: 0,
    };
  } catch (error) {
    console.warn(
      `[Social Feed] TikTok check failed for @${username}:`,
      error.message
    );

    return {
      live: false,
    };
  }
}

/*
|--------------------------------------------------------------------------
| Check platform
|--------------------------------------------------------------------------
*/

async function checkChannel(channel) {
  const platform =
    String(channel.platform || '').toLowerCase();

  if (platform === 'twitch') {
    return checkTwitch(
      channel.identifier
    );
  }

  if (platform === 'youtube') {
    return checkYouTube(
      channel.identifier
    );
  }

  if (platform === 'tiktok') {
    return checkTikTok(
      channel.identifier
    );
  }

  console.warn(
    `[Social Feed] Unknown platform "${channel.platform}" for ${channel.name}.`
  );

  return {
    live: false,
  };
}

/*
|--------------------------------------------------------------------------
| Resolve Discord member
|--------------------------------------------------------------------------
*/

async function resolveCreatorMember(guild, channel) {
  let member = null;

  const identifier =
    String(channel.identifier || '').trim();

  /*
   * Discord user ID
   */

  if (/^\d{17,20}$/.test(identifier)) {
    member =
      guild.members.cache.get(identifier) ||
      await guild.members
        .fetch(identifier)
        .catch(() => null);
  }

  /*
   * Username / display name
   */

  if (!member) {
    const target =
      String(channel.name || identifier)
        .toLowerCase()
        .replace(/^@/, '');

    member =
      guild.members.cache.find(
        m =>
          m.user.username
            .toLowerCase() === target
      ) ||
      guild.members.cache.find(
        m =>
          m.displayName
            .toLowerCase() === target
      );
  }

  return member;
}

/*
|--------------------------------------------------------------------------
| Add live role
|--------------------------------------------------------------------------
*/

async function addLiveRole(guild, channel) {
  const role =
    guild.roles.cache.get(LIVE_ROLE_ID) ||
    await guild.roles
      .fetch(LIVE_ROLE_ID)
      .catch(() => null);

  if (!role) {
    console.error(
      `[Social Feed] Live role ${LIVE_ROLE_ID} was not found in ${guild.name}.`
    );

    return false;
  }

  const member =
    await resolveCreatorMember(
      guild,
      channel
    );

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

async function removeLiveRole(guild, channel) {
  const role =
    guild.roles.cache.get(LIVE_ROLE_ID) ||
    await guild.roles
      .fetch(LIVE_ROLE_ID)
      .catch(() => null);

  if (!role) {
    return false;
  }

  const member =
    await resolveCreatorMember(
      guild,
      channel
    );

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
| Platform display name
|--------------------------------------------------------------------------
*/

function getPlatformName(platform) {
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
      return platform || 'Social Media';
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
  /*
   * IMPORTANT:
   *
   * 1542878558274457691 is the LIVE ROLE.
   *
   * It is NOT the notification channel.
   *
   * The notification channel is configured using:
   *
   * SOCIAL_LIVE_CHANNEL_ID
   */

  const notificationChannelId =
    process.env.SOCIAL_LIVE_CHANNEL_ID;

  if (!notificationChannelId) {
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
      .fetch(notificationChannelId)
      .catch(() => null);

  if (
    !notificationChannel ||
    !notificationChannel.isTextBased()
  ) {
    console.warn(
      `[Social Feed] Live notification channel ${notificationChannelId} was not found.`
    );

    return false;
  }

  const platform =
    getPlatformName(
      channel.platform
    );

  const embed =
    new EmbedBuilder()
      .setColor(0xF8D568)
      .setTitle(
        `🔴 ${channel.name} is LIVE!`
      )
      .setDescription(
        `**${channel.name}** has just gone live on **${platform}**!\n\n` +
        `**${liveData.title || 'Live now'}**`
      )
      .addFields({
        name: 'Watch now',
        value:
          `[Open stream](${liveData.url})`,
        inline: false,
      })
      .setTimestamp();

  if (
    liveData.viewerCount &&
    Number(liveData.viewerCount) > 0
  ) {
    embed.addFields({
      name: 'Viewers',
      value:
        String(liveData.viewerCount),
      inline: true,
    });
  }

  if (liveData.game) {
    embed.addFields({
      name: 'Category',
      value:
        String(liveData.game).slice(
          0,
          1024
        ),
      inline: true,
    });
  }

  const content =
    channel.pingRoleId
      ? `<@&${channel.pingRoleId}>`
      : null;

  await notificationChannel.send({
    content,
    embeds: [embed],

    allowedMentions: {
      roles:
        channel.pingRoleId
          ? [channel.pingRoleId]
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
    checkingGuilds.has(guild.id)
  ) {
    return;
  }

  checkingGuilds.add(guild.id);

  try {
    const channels =
      await getSocialFeedChannels(
        client,
        guild.id
      );

    if (!channels.length) {
      return;
    }

    for (const channel of channels) {
      try {
        const liveData =
          await checkChannel(
            channel
          );

        const wasLive =
          Boolean(channel.isLive);

        const isLive =
          Boolean(liveData.live);

        /*
         * OFFLINE -> LIVE
         */

        if (
          !wasLive &&
          isLive
        ) {
          console.log(
            `[Social Feed] ${channel.name} (${getPlatformName(channel.platform)}) went LIVE.`
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
            `[Social Feed] ${channel.name} (${getPlatformName(channel.platform)}) went OFFLINE.`
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
          wasLive !== isLive
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
          `[Social Feed] Failed checking ${channel.name} (${channel.platform}):`,
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
  if (monitorStarted) {
    return;
  }

  monitorStarted = true;

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
   * Check every minute.
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
  if (monitorTimer) {
    clearInterval(
      monitorTimer
    );

    monitorTimer = null;
  }

  monitorStarted = false;

  console.log(
    '[Social Feed] Live monitor stopped.'
  );
}
