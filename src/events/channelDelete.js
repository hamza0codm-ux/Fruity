import {
    ChannelType,
} from 'discord.js';

import {
    getJoinToCreateConfig,
    removeJoinToCreateTrigger,
    unregisterTemporaryChannel,
    getTicketData,
    saveTicketData,
} from '../utils/database.js';

import {
    getServerCounters,
    saveServerCounters,
} from '../services/serverstatsService.js';

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
    name: 'channelDelete',

    async execute(channel, client) {
        if (!channel.guild) {
            return;
        }

        const guildId =
            channel.guild.id;

        try {

            // =====================================================
            // LOG CHANNEL DELETION
            // =====================================================

            await logEvent({
                client:
                    channel.client || client,

                guildId,

                eventType:
                    EVENT_TYPES.CHANNEL_DELETE,

                data: {
                    title:
                        '📁 Channel Deleted',

                    lines: [
                        formatLogLine(
                            'Channel',
                            `#${channel.name}`
                        ),

                        formatLogLine(
                            'Channel ID',
                            `\`${channel.id}\``
                        ),

                        formatLogLine(
                            'Type',
                            getChannelType(channel)
                        ),
                    ],

                    quoted: false,
                },
            });


            // =====================================================
            // TICKET CLEANUP
            // =====================================================

            if (
                channel.type ===
                ChannelType.GuildText
            ) {
                try {
                    const ticketData =
                        await getTicketData(
                            guildId,
                            channel.id
                        );

                    if (
                        ticketData &&
                        ticketData.status === 'open'
                    ) {
                        ticketData.status =
                            'deleted';

                        ticketData.closedAt =
                            new Date()
                                .toISOString();

                        await saveTicketData(
                            guildId,
                            channel.id,
                            ticketData
                        );

                        logger.info(
                            `Ticket channel ${channel.id} was manually deleted in guild ${guildId}, marked as deleted`
                        );
                    }

                } catch (error) {
                    logger.warn(
                        `Could not clean up ticket record for deleted channel ${channel.id}:`,
                        error
                    );
                }
            }


            // =====================================================
            // ONLY VOICE/CATEGORY NEED THE REST OF THE CLEANUP
            // =====================================================

            if (
                channel.type !==
                    ChannelType.GuildVoice &&
                channel.type !==
                    ChannelType.GuildCategory
            ) {
                return;
            }


            // =====================================================
            // SERVER COUNTERS
            // =====================================================

            try {
                const counters =
                    await getServerCounters(
                        client,
                        guildId
                    );

                const orphanedCounter =
                    counters.find(
                        c =>
                            c.channelId ===
                            channel.id
                    );

                if (orphanedCounter) {
                    const updatedCounters =
                        counters.filter(
                            c =>
                                c.channelId !==
                                channel.id
                        );

                    await saveServerCounters(
                        client,
                        guildId,
                        updatedCounters
                    );
                }

            } catch (error) {
                logger.error(
                    'Error cleaning server counters:',
                    error
                );
            }


            // =====================================================
            // JOIN TO CREATE
            // =====================================================

            try {
                const config =
                    await getJoinToCreateConfig(
                        client,
                        guildId
                    );

                if (!config?.enabled) {
                    return;
                }


                if (
                    config.triggerChannels?.includes(
                        channel.id
                    )
                ) {
                    await removeJoinToCreateTrigger(
                        client,
                        guildId,
                        channel.id
                    );
                }


                if (
                    config.temporaryChannels?.[
                        channel.id
                    ]
                ) {
                    await unregisterTemporaryChannel(
                        client,
                        guildId,
                        channel.id
                    );
                }


                if (
                    config.categoryId ===
                    channel.id
                ) {
                    config.categoryId =
                        null;

                    config.enabled =
                        false;

                    await client.db.set(
                        `guild:${guildId}:jointocreate`,
                        config
                    );
                }

            } catch (error) {
                logger.error(
                    'Error cleaning Join to Create:',
                    error
                );
            }

        } catch (error) {
            logger.error(
                `Error in channelDelete event for guild ${guildId}:`,
                error
            );
        }
    },
};
