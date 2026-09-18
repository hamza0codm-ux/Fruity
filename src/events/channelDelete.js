import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'channelDelete',

    async execute(channel) {
        if (!channel.guild) return;

        const embed = new EmbedBuilder()
            .setTitle('🔴 Channel Deleted')
            .setColor(0xED4245)
            .addFields(
                {
                    name: 'Channel',
                    value: channel.name,
                },
                {
                    name: 'Channel ID',
                    value: `\`${channel.id}\``,
                }
            )
            .setTimestamp();

        await sendLog(channel.client, 'server', embed);
    },
};
