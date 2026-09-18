import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'messageDelete',

    async execute(message) {
        if (!message.guild) return;
        if (message.author?.bot) return;

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Message Deleted')
            .setColor(0xED4245)
            .addFields(
                {
                    name: 'Author',
                    value: message.author
                        ? `${message.author} (\`${message.author.id}\`)`
                        : 'Unknown',
                },
                {
                    name: 'Channel',
                    value: `${message.channel}`,
                },
                {
                    name: 'Content',
                    value: (message.content || '*Content unavailable*').slice(0, 1024),
                }
            )
            .setTimestamp();

        await sendLog(message.client, 'messages', embed);
    },
};
