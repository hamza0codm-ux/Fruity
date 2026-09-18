import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'channelUpdate',

    async execute(oldChannel, newChannel) {
        if (!newChannel.guild) return;

        const changes = [];

        if (oldChannel.name !== newChannel.name) {
            changes.push(`**Name:** ${oldChannel.name} → ${newChannel.name}`);
        }

        if (oldChannel.topic !== newChannel.topic) {
            changes.push('**Topic:** Changed');
        }

        if (oldChannel.nsfw !== newChannel.nsfw) {
            changes.push(`**NSFW:** ${oldChannel.nsfw} → ${newChannel.nsfw}`);
        }

        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
            changes.push(
                `**Slowmode:** ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`
            );
        }

        // Position changes intentionally ignored.

        if (!changes.length) return;

        const embed = new EmbedBuilder()
            .setTitle('🟡 Channel Updated')
            .setColor(0xFEE75C)
            .addFields(
                {
                    name: 'Channel',
                    value: `${newChannel} (\`${newChannel.id}\`)`,
                },
                {
                    name: 'Changes',
                    value: changes.join('\n'),
                }
            )
            .setTimestamp();

        await sendLog(newChannel.client, 'server', embed);
    },
};
