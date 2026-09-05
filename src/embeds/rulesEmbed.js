import { EmbedBuilder, Events } from 'discord.js';

import { logger } from '../utils/logger.js';

const RULES_CONFIG = {
    channelId: '1541550498925256744',
    imageUrl: '',
    color: 0xF8D568,
};

function buildRulesEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('📜 Fruity Rules')
        .setDescription(
            '**🌐 Official Server Guidelines**\n\n' +
            'Welcome to our community. Keep it professional. Keep it respectful. Keep it elite.\n\n' +
            '**💬 1. English Only**\n\n' +
            'All conversations must be in English to ensure transparency and effective moderation.'
        )
        .setColor(RULES_CONFIG.color)
        .setFooter({
            text: 'Fruity • Rules',
        });

    if (RULES_CONFIG.imageUrl) {
        embed.setImage(RULES_CONFIG.imageUrl);
    }

    return embed;
}

export default {
    name: Events.ClientReady,
    once: true,

    async execute(...args) {
        const client = args[args.length - 1];

        try {
            const channel = await client.channels.fetch(
                RULES_CONFIG.channelId
            );

            if (!channel || !channel.isTextBased()) {
                logger.error(
                    `Rules: channel ${RULES_CONFIG.channelId} could not be found or is not text based.`
                );
                return;
            }

            const embed = buildRulesEmbed();

            await channel.send({
                embeds: [embed],
            });

            logger.info(
                `Rules embed sent to #${channel.name}.`
            );
        } catch (error) {
            logger.error(
                'Rules: failed to send rules embed:',
                error
            );
        }
    },
};
