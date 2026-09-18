import {
    AuditLogEvent,
    EmbedBuilder,
} from 'discord.js';

import { sendLog } from '../services/logger.js';

export default {
    name: 'webhookUpdate',

    async execute(channel) {
        if (!channel.guild) return;

        const logs = await channel.guild.fetchAuditLogs({
            limit: 5,
        }).catch(() => null);

        if (!logs) return;

        const entry = logs.entries.find(
            entry =>
                entry.target?.channelId === channel.id
                || entry.target?.channel?.id === channel.id
        );

        if (!entry) return;

        let action = 'Webhook Updated';
        let color = 0xFEE75C;

        if (entry.action === AuditLogEvent.WebhookCreate) {
            action = 'Webhook Created';
            color = 0x57F287;
        }

        if (entry.action === AuditLogEvent.WebhookDelete) {
            action = 'Webhook Deleted';
            color = 0xED4245;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🪝 ${action}`)
            .setColor(color)
            .addFields(
                {
                    name: 'Channel',
                    value: `${channel}`,
                },
                {
                    name: 'Performed By',
                    value: entry.executor
                        ? `${entry.executor} (\`${entry.executor.id}\`)`
                        : 'Unknown',
                }
            )
            .setTimestamp();

        await sendLog(channel.client, 'bots', embed);
    },
};
