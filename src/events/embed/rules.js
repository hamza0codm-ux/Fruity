import { EmbedBuilder, Events } from 'discord.js';

import { logger } from '../../utils/logger.js';

const RULES_CONFIG = {
    channelId: '1541550498925256744',

    // Add your image URL here later.
    imageUrl: '',

    color: 0xF8D568,
};

function buildRulesEmbed() {
    const rules = [
        '**🌐 Official Server Guidelines**\n\nWelcome to our community. This server represents our brand, our players, and our community. Keep it professional. Keep it respectful. Keep it elite.',

        '**💬 1. English Only**\n\nAll conversations must be in English to ensure transparency and effective moderation. Refrain from engaging in heated debates on politics, religion, or controversial topics to maintain a friendly environment.',

        '**🤝 2. Respect Everyone & Protect Privacy**\n\nTreat all members with maturity, kindness, and common sense. Do not share the private information of others without consent. There is absolute zero tolerance for racism, sexism, homophobia, harassment, doxing, personal attacks, discrimination, or hate speech of any kind. Respect privacy and personal boundaries at all times.',

        '**🤬 3. No Inappropriate Language**\n\nExcessive swearing or offensive language is not allowed. Keep it competitive — not toxic.',

        '**🛑 4. No Spamming**\n\nDo not flood chats with repeated messages, excessive links, or content that disrupts conversations. Do not spam emojis or mass ping members and moderators.',

        '**🔞 5. No NSFW Content**\n\nThis is a professional environment built to keep the server safe for everyone. Explicit, pornographic, or adult content—including NSFW images, videos, or links—is strictly prohibited. Violators will be banned.',

        '**📢 6. No Advertisements**\n\nNo server advertising, self-promotion, or DM advertising is allowed. External server promotion will result in a mute. Partnerships must go through management.',

        '**⚠️ 7. No Threats or Impersonation**\n\nThreats of any kind are forbidden. Do not impersonate other members, staff, or public figures. Doing so will result in an immediate ban.',

        '**🛡️ 8. Respect Staff Decisions**\n\nFollow the instructions of moderators and leadership; their decisions are final. Do not start public arguments about punishments, create drama, or ragebait personnel. If you have concerns, handle them privately and respectfully.',

        '**🎉 9. Do Not Ruin Community Channels**\n\nPlease post in the relevant channels and avoid flooding off-topic discussions into topic-specific areas. Do not disrupt fun community channels. Trolling, ruining games, or intentionally disturbing activities will result in timeouts.',

        '**📜 10. Follow Discord Terms of Service**\n\nAll users must adhere to the official Discord Terms of Service and Community Guidelines.',

        '**🚨 Final Notice**\n\nFailure to follow these rules will result in:\n• ⚠️ Warnings\n• ⏰ Timeouts\n• 🔨 Kicks\n• ⛔ Permanent bans',
    ];

    const embed = new EmbedBuilder()
        .setTitle('<:white_rules:1544646747186274344> Fruity Rules')
        .setDescription(rules.join('\n\n'))
        .setColor(RULES_CONFIG.color)
        .setFooter({
            text: 'Fruity • Rules',
        });

    if (RULES_CONFIG.imageUrl) {
        embed.setImage(RULES_CONFIG.imageUrl);
    }

    return embed;
}

function normalizeEmbed(embed) {
    if (!embed) {
        return null;
    }

    const data =
        typeof embed.toJSON === 'function'
            ? embed.toJSON()
            : embed;

    return {
        title: data.title ?? null,
        description: data.description ?? null,
        color: data.color ?? null,

        image: data.image?.url
            ? {
                url: data.image.url,
            }
            : null,

        thumbnail: data.thumbnail?.url
            ? {
                url: data.thumbnail.url,
            }
            : null,

        footer: data.footer
            ? {
                text: data.footer.text ?? null,
                icon_url: data.footer.icon_url ?? null,
            }
            : null,

        fields: (data.fields ?? []).map(field => ({
            name: field.name ?? null,
            value: field.value ?? null,
            inline: Boolean(field.inline),
        })),
    };
}

function embedsAreEqual(existingEmbed, desiredEmbed) {
    return (
        JSON.stringify(normalizeEmbed(existingEmbed)) ===
        JSON.stringify(normalizeEmbed(desiredEmbed))
    );
}

async function setupRules(client) {
    try {
        const channel = await client.channels.fetch(
            RULES_CONFIG.channelId
        );

        if (!channel || !channel.isTextBased()) {
            logger.error(
                `Rules: channel ${RULES_CONFIG.channelId} is invalid or not text based.`
            );
            return;
        }

        const rulesEmbed = buildRulesEmbed();

        const messages = await channel.messages.fetch({
            limit: 50,
        });

        const existing = messages.find(message => {
            if (message.author?.id !== client.user?.id) {
                return false;
            }

            return message.embeds?.some(
                embed => embed.title === '📜 Fruity Rules'
            );
        });

        // Existing Rules message found.
        if (existing) {
            const existingEmbed = existing.embeds?.[0];

            // Nothing changed, so DON'T edit the message.
            if (embedsAreEqual(existingEmbed, rulesEmbed)) {
                logger.info(
                    `Rules embed unchanged in #${channel.name}; no edit needed.`
                );

                return existing;
            }

            // Rules were changed, so update the message.
            await existing.edit({
                embeds: [rulesEmbed],
            });

            logger.info(
                `Rules embed updated in #${channel.name}.`
            );

            return existing;
        }

        // No Rules message exists, so create one.
        const message = await channel.send({
            embeds: [rulesEmbed],
        });

        logger.info(
            `Rules embed created in #${channel.name}.`
        );

        return message;
    } catch (error) {
        logger.error(
            'Rules: failed to create/update Rules embed:',
            error
        );

        return null;
    }
}

export default {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        await setupRules(client);
    },
};
