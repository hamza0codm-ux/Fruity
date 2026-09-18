import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'messageUpdate',

    async execute(oldMessage, newMessage) {
        if (!newMessage.guild) return;
        if (newMessage.author?.bot) return;

        if (oldMessage.content === newMessage.content) return;

        const before = oldMessage.content || '*Unavailable*';
        const after = newMessage.content || '*Unavailable*';

        const embed = new EmbedBuilder()
            .setTitle('✏️ Message Edited')
            .setColor(0xFEE75C)
            .addFields(
                {
                    name: 'Author',
                    value: `${newMessage.author} (\`${newMessage.author.id}\`)`,
                },
                {
                    name: 'Channel',
                    value: `${newMessage.channel}`,
                },
                {
                    name: 'Before',
                    value: before.slice(0, 1024),
                },
                {
                    name: 'After',
                    value: after.slice(0, 1024),
                }
            )
            .setTimestamp();

        await sendLog(newMessage.client, 'messages', embed);
    },
};
