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
| Generic JSON helper
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

  const response = await fetch(
    url.toString(),
    {
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error(
      `Twitch authentication failed with HTTP ${response.status}.`
    );
  }

  const data = await response.json();

  twitchAccessToken = data.access_token;

  twitchTokenExpiresAt =
    Date.now() +
    Number(data.expires_in || 3600) * 1000;

  return twitchAccessToken;
}

/*
|--------------------------------------------------------------------------
| Extract Twitch username
|--------------------------------------------------------------------------
*/

function getTwitchUsername(value) {
  const input = String(value || '').trim();

  if (!input) {
    return '';
  }

  try {
    const url = new URL(
      input.startsWith('http')
        ? input
        : `https://${input}`
    );

    const parts = url.pathname
      .split('/')
      .filter(Boolean);

    return (
      parts[0] || ''
    )
      .replace(/^@/, '')
      .trim();
  } catch {
    return input
      .replace(
        /^https?:\/\/(www\.)?twitch\.tv\//i,
        ''
      )
      .split(/[/?#]/)[0]
      .replace(/^@/, '')
      .trim();
  }
}

/*
|--------------------------------------------------------------------------
| Twitch live check
|--------------------------------------------------------------------------
*/

async function checkTwitch(value) {
  const clientId =
    process.env.TWITCH_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      'TWITCH_CLIENT_ID is missing.'
    );
  }

  const username =
    getTwitchUsername(value);

  if (!username) {
    return {
      live: false,
    };
  }

  const token =
    await getTwitchAccessToken();

  const url = new URL(
    'https://api.twitch.tv/helix/streams'
  );

  url.searchParams.set(
    'user_login',
    username
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
      `https://www.twitch.tv/${username}`,

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
| Extract YouTube channel information
|--------------------------------------------------------------------------
*/

function parseYouTubeLink(value) {
  const input =
    String(value || '').trim();

  if (!input) {
    return {
      channelId: null,
      handle: null,
    };
  }

  let url;

  try {
    url = new URL(
      input.startsWith('http')
        ? input
        : `https://${input}`
    );
  } catch {
    return {
      channelId: null,
      handle: null,
    };
  }

  const pathname =
    url.pathname;

  const channelMatch =
    pathname.match(
      /^\/channel\/([^/]+)/i
    );

  if (channelMatch?.[1]) {
    return {
      channelId:
        channelMatch[1],
      handle: null,
    };
  }

  const handleMatch =
    pathname.match(
      /^\/@([^/]+)/i
    );

  if (handleMatch?.[1]) {
    return {
      channelId: null,
      handle:
        handleMatch[1],
    };
  }

  return {
    channelId: null,
    handle: null,
  };
}

/*
|--------------------------------------------------------------------------
| Resolve YouTube channel ID
|--------------------------------------------------------------------------
*/

async function resolveYouTubeChannelId(
  value
) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY is missing.'
    );
  }

  const {
    channelId,
    handle,
  } =
    parseYouTubeLink(value);

  if (channelId) {
    return channelId;
  }

  if (!handle) {
    return null;
  }

  const url =
    new URL(
      'https://www.googleapis.com/youtube/v3/channels'
    );

  url.searchParams.set(
    'part',
    'id'
  );

  url.searchParams.set(
    'forHandle',
    handle
  );

  url.searchParams.set(
    'key',
    apiKey
  );

  const data =
    await fetchJson(
      url.toString()
    );

  return (
    data?.items?.[0]?.id ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| YouTube live check
|--------------------------------------------------------------------------
*/

async function checkYouTube(value) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY is missing.'
    );
  }

  const channelId =
    await resolveYouTubeChannelId(
      value
    );

  if (!channelId) {
    return {
      live: false,
    };
  }

  const url =
    new URL(
      'https://www.googleapis.com/youtube/v3/search'
    );

  url.searchParams.set(
    'part',
    'snippet'
  );

  url.searchParams.set(
    'channelId',
    channelId
  );

  url.searchParams.set(
    'eventType',
    'live'
  );

  url.searchParams.set(
    'type',
    'video'
  );

  url.searchParams.set(
    'maxResults',
    '1'
  );

  url.searchParams.set(
    'key',
    apiKey
  );

  const data =
    await fetchJson(
      url.toString()
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
      `https://www.youtube.com/watch?v=${videoId}`,

    game: null,

    viewerCount: 0,
  };
}

/*
|--------------------------------------------------------------------------
| TikTok username
|--------------------------------------------------------------------------
*/

function getTikTokUsername(value) {
  const input =
    String(value || '').trim();

  if (!input) {
    return '';
  }

  return input
    .replace(
      /^https?:\/\/(www\.)?tiktok\.com\/@?/i,
      ''
    )
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
}

/*
|--------------------------------------------------------------------------
| TikTok live check
|--------------------------------------------------------------------------
|
| TikTok doesn't provide the same simple public live endpoint
| that Twitch does, so this uses the creator page.
|
|--------------------------------------------------------------------------
*/

async function checkTikTok(value) {
  const username =
    getTikTokUsername(value);

  if (!username) {
    return {
      live: false,
    };
  }

  const url =
    `https://www.tiktok.com/@${encodeURIComponent(
      username
    )}`;

  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',

            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

            'Accept-Language':
              'en-US,en;q=0.9',

            Referer:
              'https://www.tiktok.com/',
          },
        }
      );

    if (!response.ok) {
      console.warn(
        `[Social Feed] TikTok returned HTTP ${response.status} for @${username}.`
      );

      return {
        live: false,
      };
    }

    const html =
      await response.text();

    const lower =
      html.toLowerCase();

    const indicators = [
      '"islive":true',
      '"islive": true',
      '"is_live":true',
      '"is_live": true',
      '"live":true',
      '"live": true',
      '"livestatus":1',
      '"livestatus": 1',
      '"live_status":1',
      '"live_status": 1',
    ];

    const isLive =
      indicators.some(
        indicator =>
          lower.includes(
            indicator
          )
      );

    if (!isLive) {
      return {
        live: false,
      };
    }

    let title =
      'Live on TikTok';

    const titlePatterns = [
      /"roomtitle":"([^"]+)"/i,
      /"room_title":"([^"]+)"/i,
      /"livetitle":"([^"]+)"/i,
      /"live_title":"([^"]+)"/i,
    ];

    for (
      const pattern of titlePatterns
    ) {
      const match =
        html.match(pattern);

      if (match?.[1]) {
        title =
          match[1]
            .replace(
              /\\"/g,
              '"'
            )
            .replace(
              /\\u0026/g,
              '&'
            );

        break;
      }
    }

    return {
      live: true,

      title,

      url:
        `https://www.tiktok.com/@${username}/live`,

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

async function checkChannel(feed) {
  const platform =
    String(
      feed.platform || ''
    ).toLowerCase();

  /*
   * New system uses link.
   *
   * identifier is kept as a fallback for
   * old configurations.
   */
  const source =
    feed.link ||
    feed.identifier;

  if (platform === 'twitch') {
    return checkTwitch(
      source
    );
  }

  if (platform === 'youtube') {
    return checkYouTube(
      source
    );
  }

  if (platform === 'tiktok') {
    return checkTikTok(
      source
    );
  }

  console.warn(
    `[Social Feed] Unknown platform "${feed.platform}" for "${feed.name}".`
  );

  return {
    live: false,
  };
}

/*
|--------------------------------------------------------------------------
| Platform name
|--------------------------------------------------------------------------
*/

function getPlatformName(
  platform
) {
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
      return 'Social Media';
  }
}

/*
|--------------------------------------------------------------------------
| Resolve Discord creator
|--------------------------------------------------------------------------
*/

async function resolveCreatorMember(
  guild,
  feed
) {
  /*
   * NEW:
   * Use the Discord user selected in
   * /social add.
   */
  if (feed.discordUserId) {
    const member =
      guild.members.cache.get(
        feed.discordUserId
      ) ||
      await guild.members
        .fetch(
          feed.discordUserId
        )
        .catch(() => null);

    if (member) {
      return member;
    }
  }

  /*
   * Backwards compatibility.
   */
  const identifier =
    String(
      feed.identifier || ''
    ).trim();

  if (
    /^\d{17,20}$/.test(
      identifier
    )
  ) {
    const member =
      guild.members.cache.get(
        identifier
      ) ||
      await guild.members
        .fetch(
          identifier
        )
        .catch(() => null);

    if (member) {
      return member;
    }
  }

  /*
   * Final fallback:
   * Try custom feed name against
   * usernames/display names.
   */
  const target =
    String(
      feed.name || ''
    )
      .toLowerCase()
      .replace(/^@/, '')
      .trim();

  if (!target) {
    return null;
  }

  return (
    guild.members.cache.find(
      member =>
        member.user.username
          .toLowerCase() === target
    ) ||
    guild.members.cache.find(
      member =>
        String(
          member.displayName || ''
        ).toLowerCase() === target
    ) ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| Add live role
|--------------------------------------------------------------------------
*/

async function addLiveRole(
  guild,
  feed
) {
  const role =
    guild.roles.cache.get(
      LIVE_ROLE_ID
    ) ||
    await guild.roles
      .fetch(
        LIVE_ROLE_ID
      )
      .catch(() => null);

  if (!role) {
    console.error(
      `[Social Feed] Live role ${LIVE_ROLE_ID} was not found.`
    );

    return false;
  }

  const member =
    await resolveCreatorMember(
      guild,
      feed
    );

  if (!member) {
    console.warn(
      `[Social Feed] Could not find Discord user for "${feed.name}".`
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
      `Social feed: ${feed.name} went live`
    );

    console.log(
      `[Social Feed] Added live role to ${member.user.tag} for ${feed.name}.`
    );

    return true;
  } catch (error) {
    console.error(
      `[Social Feed] Failed adding live role for ${feed.name}:`,
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
  feed
) {
  const role =
    guild.roles.cache.get(
      LIVE_ROLE_ID
    ) ||
    await guild.roles
      .fetch(
        LIVE_ROLE_ID
      )
      .catch(() => null);

  if (!role) {
    return false;
  }

  const member =
    await resolveCreatorMember(
      guild,
      feed
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
      `Social feed: ${feed.name} went offline`
    );

    console.log(
      `[Social Feed] Removed live role from ${member.user.tag}.`
    );

    return true;
  } catch (error) {
    console.error(
      `[Social Feed] Failed removing live role for ${feed.name}:`,
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
  feed,
  liveData
) {
  /*
   * IMPORTANT:
   *
   * Each social feed now has its OWN
   * live notification channel.
   */
  const notificationChannelId =
    feed.liveChannelId;

  if (!notificationChannelId) {
    console.warn(
      `[Social Feed] No live channel configured for "${feed.name}".`
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
      .catch(() => null);

  if (
    !notificationChannel ||
    !notificationChannel.isTextBased()
  ) {
    console.warn(
      `[Social Feed] Live channel ${notificationChannelId} for "${feed.name}" was not found.`
    );

    return false;
  }

  const platform =
    getPlatformName(
      feed.platform
    );

  const embed =
    new EmbedBuilder()
      .setColor(0xF8D568)
      .setTitle(
        `🔴 ${feed.name} is LIVE!`
      )
      .setDescription(
        `**${feed.name}** has just gone live on **${platform}**!\n\n` +
        `**${liveData.title || 'Live now'}**`
      )
      .addFields({
        name:
          'Watch now',
        value:
          `[Open stream](${liveData.url})`,
        inline:
          false,
      })
      .setTimestamp();

  if (
    liveData.viewerCount &&
    Number(
      liveData.viewerCount
    ) > 0
  ) {
    embed.addFields({
      name:
        'Viewers',
      value:
        String(
          liveData.viewerCount
        ),
      inline:
        true,
    });
  }

  if (liveData.game) {
    embed.addFields({
      name:
        'Category',
      value:
        String(
          liveData.game
        ).slice(
          0,
          1024
        ),
      inline:
        true,
    });
  }

  if (feed.discordUserId) {
    embed.addFields({
      name:
        'Creator',
      value:
        `<@${feed.discordUserId}>`,
      inline:
        true,
    });
  }

  const content =
    feed.pingRoleId
      ? `<@&${feed.pingRoleId}>`
      : null;

  try {
    await notificationChannel.send({
      content,

      embeds: [
        embed,
      ],

      allowedMentions: {
        roles:
          feed.pingRoleId
            ? [
                feed.pingRoleId,
              ]
            : [],
      },
    });

    return true;
  } catch (error) {
    console.error(
      `[Social Feed] Failed sending live notification for ${feed.name}:`,
      error
    );

    return false;
  }
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
    const feeds =
      await getSocialFeedChannels(
        client,
        guild.id
      );

    if (!feeds.length) {
      return;
    }

    for (
      const feed of feeds
    ) {
      try {
        /*
         * POSTS ONLY:
         *
         * Don't run live API requests.
         */
        if (
          feed.notificationType ===
          'posts'
        ) {
          continue;
        }

        const liveData =
          await checkChannel(
            feed
          );

        const wasLive =
          Boolean(
            feed.isLive
          );

        const isLive =
          Boolean(
            liveData.live
          );

        /*
         * ---------------------------------------------------------------
         * OFFLINE -> LIVE
         * ---------------------------------------------------------------
         */

        if (
          !wasLive &&
          isLive
        ) {
          console.log(
            `[Social Feed] ${feed.name} (${getPlatformName(feed.platform)}) went LIVE.`
          );

          /*
           * Add the global live role.
           */
          await addLiveRole(
            guild,
            feed
          );

          /*
           * Send notification to this feed's
           * configured live channel.
           */
          await sendLiveNotification(
            guild,
            feed,
            liveData
          );
        }

        /*
         * ---------------------------------------------------------------
         * LIVE -> OFFLINE
         * ---------------------------------------------------------------
         */

        if (
          wasLive &&
          !isLive
        ) {
          console.log(
            `[Social Feed] ${feed.name} (${getPlatformName(feed.platform)}) went OFFLINE.`
          );

          await removeLiveRole(
            guild,
            feed
          );
        }

        /*
         * ---------------------------------------------------------------
         * Save state
         * ---------------------------------------------------------------
         */

        if (
          wasLive !== isLive
        ) {
          await updateSocialFeedLiveState(
            client,
            guild.id,
            feed.id,
            isLive
          );
        }
      } catch (error) {
        console.error(
          `[Social Feed] Failed checking "${feed.name}" (${feed.platform}):`,
          error.message
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
| Run live check once
|--------------------------------------------------------------------------
*/

export async function runSocialLiveCheck(
  client
) {
  if (!client) {
    return;
  }

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

  monitorStarted =
    true;

  console.log(
    '[Social Feed] Live monitor started.'
  );

  /*
   * Initial check.
   */
  runSocialLiveCheck(
    client
  ).catch(error => {
    console.error(
      '[Social Feed] Initial live check failed:',
      error
    );
  });

  /*
   * Check every minute.
   */
  monitorTimer =
    setInterval(
      () => {
        runSocialLiveCheck(
          client
        ).catch(error => {
          console.error(
            '[Social Feed] Scheduled live check failed:',
            error
          );
        });
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

  monitorStarted =
    false;

  console.log(
    '[Social Feed] Live monitor stopped.'
  );
}
