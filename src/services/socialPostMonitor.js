/*
|--------------------------------------------------------------------------
| Social Media Post Monitor
|--------------------------------------------------------------------------
|
| Monitors:
|
|   YouTube -> New uploaded videos
|   Twitch  -> New VODs
|
| TikTok post monitoring is intentionally not included here because
| the current bot does not have an official TikTok post API configured.
|
|--------------------------------------------------------------------------
*/

import {
  EmbedBuilder,
} from 'discord.js';

import {
  getSocialFeedChannels,
  updateSocialFeedPostState,
} from './socialFeedConfig.js';

const CHECK_INTERVAL =
  2 * 60 * 1000;

let monitorStarted =
  false;

let monitorTimer =
  null;

const checkingGuilds =
  new Set();

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

async function fetchJson(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        ...options,
        headers: {
          Accept:
            'application/json',
          ...(options.headers || {}),
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return response.json();
}

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
| Extract Twitch username
|--------------------------------------------------------------------------
*/

function getTwitchUsername(
  link
) {
  const value =
    String(link || '')
      .trim();

  try {
    const url =
      new URL(
        value.startsWith('http')
          ? value
          : `https://${value}`
      );

    const parts =
      url.pathname
        .split('/')
        .filter(Boolean);

    return (
      parts[0] ||
      ''
    )
      .replace(/^@/, '')
      .trim();
  } catch {
    return value
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
| Extract YouTube information
|--------------------------------------------------------------------------
*/

function parseYouTubeLink(
  link
) {
  const value =
    String(link || '')
      .trim();

  let url;

  try {
    url =
      new URL(
        value.startsWith('http')
          ? value
          : `https://${value}`
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

  if (
    channelMatch?.[1]
  ) {
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

  if (
    handleMatch?.[1]
  ) {
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
| YouTube channel lookup
|--------------------------------------------------------------------------
*/

async function resolveYouTubeChannelId(
  link
) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'YOUTUBE_API_KEY is not configured.'
    );
  }

  const {
    channelId,
    handle,
  } =
    parseYouTubeLink(
      link
    );

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
| Get YouTube newest upload
|--------------------------------------------------------------------------
*/

async function checkYouTubePost(
  feed
) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.warn(
      '[Social Feed] YOUTUBE_API_KEY is not configured. YouTube post monitoring skipped.'
    );

    return null;
  }

  const channelId =
    await resolveYouTubeChannelId(
      feed.link ||
      feed.identifier
    );

  if (!channelId) {
    return null;
  }

  /*
   * Get channel uploads playlist.
   */

  const channelUrl =
    new URL(
      'https://www.googleapis.com/youtube/v3/channels'
    );

  channelUrl.searchParams.set(
    'part',
    'contentDetails'
  );

  channelUrl.searchParams.set(
    'id',
    channelId
  );

  channelUrl.searchParams.set(
    'key',
    apiKey
  );

  const channelData =
    await fetchJson(
      channelUrl.toString()
    );

  const uploadsPlaylistId =
    channelData
      ?.items?.[0]
      ?.contentDetails
      ?.relatedPlaylists
      ?.uploads;

  if (!uploadsPlaylistId) {
    return null;
  }

  /*
   * Get newest uploads.
   */

  const playlistUrl =
    new URL(
      'https://www.googleapis.com/youtube/v3/playlistItems'
    );

  playlistUrl.searchParams.set(
    'part',
    'snippet,contentDetails'
  );

  playlistUrl.searchParams.set(
    'playlistId',
    uploadsPlaylistId
  );

  playlistUrl.searchParams.set(
    'maxResults',
    '5'
  );

  playlistUrl.searchParams.set(
    'key',
    apiKey
  );

  const data =
    await fetchJson(
      playlistUrl.toString()
    );

  const item =
    data?.items?.[0];

  if (!item) {
    return null;
  }

  const videoId =
    item.contentDetails
      ?.videoId;

  if (!videoId) {
    return null;
  }

  const title =
    item.snippet?.title ||
    'New YouTube video';

  const publishedAt =
    item.contentDetails
      ?.videoPublishedAt ||
    item.snippet
      ?.publishedAt ||
    null;

  return {
    id:
      videoId,

    title,

    url:
      `https://www.youtube.com/watch?v=${videoId}`,

    publishedAt:
      publishedAt
        ? new Date(
            publishedAt
          ).getTime()
        : Date.now(),
  };
}

/*
|--------------------------------------------------------------------------
| Twitch token
|--------------------------------------------------------------------------
*/

let twitchToken =
  null;

let twitchTokenExpiresAt =
  0;

async function getTwitchToken() {
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
    twitchToken &&
    Date.now() <
      twitchTokenExpiresAt -
        60_000
  ) {
    return twitchToken;
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

  const response =
    await fetch(
      url.toString(),
      {
        method:
          'POST',
      }
    );

  if (!response.ok) {
    throw new Error(
      `Twitch token request failed with HTTP ${response.status}.`
    );
  }

  const data =
    await response.json();

  twitchToken =
    data.access_token;

  twitchTokenExpiresAt =
    Date.now() +
    Number(
      data.expires_in || 0
    ) *
      1000;

  return twitchToken;
}

/*
|--------------------------------------------------------------------------
| Twitch user lookup
|--------------------------------------------------------------------------
*/

async function getTwitchUserId(
  username
) {
  const token =
    await getTwitchToken();

  const url =
    new URL(
      'https://api.twitch.tv/helix/users'
    );

  url.searchParams.set(
    'login',
    username
  );

  const data =
    await fetchJson(
      url.toString(),
      {
        headers: {
          'Client-ID':
            process.env.TWITCH_CLIENT_ID,

          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  return (
    data?.data?.[0] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| Get newest Twitch VOD
|--------------------------------------------------------------------------
*/

async function checkTwitchPost(
  feed
) {
  const username =
    getTwitchUsername(
      feed.link ||
      feed.identifier
    );

  if (!username) {
    return null;
  }

  const token =
    await getTwitchToken();

  const user =
    await getTwitchUserId(
      username
    );

  if (!user?.id) {
    return null;
  }

  const url =
    new URL(
      'https://api.twitch.tv/helix/videos'
    );

  url.searchParams.set(
    'user_id',
    user.id
  );

  url.searchParams.set(
    'first',
    '5'
  );

  const data =
    await fetchJson(
      url.toString(),
      {
        headers: {
          'Client-ID':
            process.env.TWITCH_CLIENT_ID,

          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  const video =
    data?.data?.[0];

  if (!video) {
    return null;
  }

  return {
    id:
      video.id,

    title:
      video.title ||
      'New Twitch video',

    url:
      video.url ||
      `https://www.twitch.tv/videos/${video.id}`,

    publishedAt:
      video.published_at
        ? new Date(
            video.published_at
          ).getTime()
        : Date.now(),

    thumbnail:
      video.thumbnail_url ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| Check platform
|--------------------------------------------------------------------------
*/

async function checkPost(
  feed
) {
  switch (
    String(feed.platform || '')
      .toLowerCase()
  ) {
    case 'youtube':
      return checkYouTubePost(
        feed
      );

    case 'twitch':
      return checkTwitchPost(
        feed
      );

    case 'tiktok':
      /*
       * No official post endpoint configured
       * in the current bot.
       */
      return null;

    default:
      return null;
  }
}

/*
|--------------------------------------------------------------------------
| Send notification
|--------------------------------------------------------------------------
*/

async function sendPostNotification(
  guild,
  feed,
  post
) {
  if (
    !feed.postChannelId
  ) {
    return false;
  }

  const notificationChannel =
    guild.channels.cache.get(
      feed.postChannelId
    ) ||
    await guild.channels
      .fetch(
        feed.postChannelId
      )
      .catch(() => null);

  if (
    !notificationChannel ||
    !notificationChannel.isTextBased()
  ) {
    console.warn(
      `[Social Feed] Post channel for ${feed.name} was not found.`
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
        `🎥 ${feed.name} posted a new video!`
      )
      .setDescription(
        `**${feed.name}** has a new post on **${platform}**.\n\n` +
        `**${post.title || 'New post'}**`
      )
      .addFields({
        name:
          'Watch now',
        value:
          `[Open post](${post.url})`,
        inline:
          false,
      })
      .setTimestamp();

  if (
    post.thumbnail
  ) {
    embed.setThumbnail(
      post.thumbnail
    );
  }

  const content =
    feed.pingRoleId
      ? `<@&${feed.pingRoleId}>`
      : null;

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
         * Ignore live-only feeds.
         */
        if (
          feed.notificationType ===
          'live'
        ) {
          continue;
        }

        /*
         * TikTok posts are not currently
         * monitored.
         */
        if (
          feed.platform ===
          'tiktok'
        ) {
          continue;
        }

        const post =
          await checkPost(
            feed
          );

        if (!post) {
          continue;
        }

        /*
         * First run:
         *
         * Save the newest post without
         * notifying, otherwise the bot would
         * spam the server when first enabled.
         */
        if (
          !feed.lastPostId
        ) {
          await updateSocialFeedPostState(
            client,
            guild.id,
            feed.id,
            {
              lastPostId:
                post.id,

              lastPostAt:
                post.publishedAt,
            }
          );

          console.log(
            `[Social Feed] Initialised post state for ${feed.name}: ${post.id}`
          );

          continue;
        }

        /*
         * Already seen.
         */
        if (
          String(
            feed.lastPostId
          ) ===
          String(
            post.id
          )
        ) {
          continue;
        }

        /*
         * Save state BEFORE sending.
         *
         * This prevents duplicate notifications
         * if Discord/API calls take a while.
         */
        await updateSocialFeedPostState(
          client,
          guild.id,
          feed.id,
          {
            lastPostId:
              post.id,

            lastPostAt:
              post.publishedAt,
          }
        );

        await sendPostNotification(
          guild,
          feed,
          post
        );

        console.log(
          `[Social Feed] New post detected for ${feed.name}: ${post.id}`
        );
      } catch (error) {
        console.error(
          `[Social Feed] Post check failed for ${feed.name}:`,
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
| Run monitor
|--------------------------------------------------------------------------
*/

export async function runSocialPostCheck(
  client
) {
  if (!client) {
    return;
  }

  for (
    const guild of client.guilds.cache.values()
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

export function startSocialPostMonitor(
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
    '[Social Feed] Post monitor started.'
  );

  runSocialPostCheck(
    client
  ).catch(error => {
    console.error(
      '[Social Feed] Initial post check failed:',
      error
    );
  });

  monitorTimer =
    setInterval(
      () => {
        runSocialPostCheck(
          client
        ).catch(error => {
          console.error(
            '[Social Feed] Post monitor error:',
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

export function stopSocialPostMonitor() {
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
    '[Social Feed] Post monitor stopped.'
  );
}
