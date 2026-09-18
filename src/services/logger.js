import {
    EmbedBuilder,
} from 'discord.js';

import { config } from '../config/config.js';

export async function sendLog(client, type, embed) {
    const channelId = config.logs[type];

    if (!channelId) {
        console.warn(`[LOGGER] Unknown log type: ${type}`);
        return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
        console.warn(`[LOGGER] Could not find channel ${channelId}`);
        return;
    }

    if (!channel.isTextBased()) {
        console.warn(`[LOGGER] Channel ${channelId} is not text based`);
        return;
    }

    await channel.send({
        embeds: [embed],
    }).catch(error => {
        console.error(`[LOGGER] Failed to send log:`, error);
    });
}

export function createLogEmbed({
    title,
    description,
    color = 0xF8D568,
    fields = [],
}) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || null)
        .addFields(fields)
        .setColor(color)
        .setTimestamp();
}
