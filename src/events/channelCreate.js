import {
    Events,
    ChannelType,
} from 'discord.js';

import {
    logEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    formatLogLine,
} from '../utils/logging/logEmbeds.js';

import {
    logger,
} from '../utils/logger.js';


function getChannelType(channel) {
    const types = {
        [ChannelType.GuildText]: 'Text',
        [ChannelType.GuildVoice]: 'Voice',
        [ChannelType.GuildCategory]: 'Category',
        [ChannelType.GuildAnnouncement]: 'Announcement',
        [ChannelType.GuildStageVoice]: 'Stage',
        [ChannelType.GuildForum]: 'Forum',
        [ChannelType.GuildMedia]: 'Media',
    };

    return types[channel.type] || 'Unknown';
}


export default {
    name: Events.ChannelCreate,
    once: false,

    async execute(channel) {
        try {
            if (!channel.guild) {
                return;
            }

            const lines = [
                formatLogLine(
                    'Channel',
                    `${channel} • ${channel.name}`
                ),

                formatLogLine(
                    'Channel ID',
                    `\`${channel.id}\``
                ),

                formatLogLine(
                    'Type',
                    getChannelType(channel)
                ),

                formatLogLine(
                    'Category',
                    channel.parent
                        ? `${channel.parent.name} • \`${channel.parent.id}\``
                        : 'None'
                ),
            ];

            await logEvent({
                client: channel.client,
                guildId: channel.guild.id,
                eventType: EVENT_TYPES.CHANNEL_CREATE,

                data: {
                    title: '📁 Channel Created',
                    lines,
                    quoted: false,
                },
            });

        } catch (error) {
            logger.error(
                'Error in channelCreate:',
                error
            );
        }
    },
};
