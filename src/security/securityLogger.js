import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';

import {
    SECURITY_LOG_CHANNEL_ID,
    securityConfig,
} from './securityConfig.js';

const minorActionTimers = new Map();

/**
 * Resolve a Discord object to a readable name.
 * Prevents things like:
 *
 * Target: [object Object]
 */
function resolveName(value) {
    if (!value) {
        return 'Unknown';
    }

    if (typeof value === 'string') {
        return value;
    }

    return (
        value.tag ||
        value.displayName ||
        value.username ||
        value.name ||
        value.user?.tag ||
        value.user?.username ||
        value.id ||
        'Unknown'
    );
}

/**
 * Creates the action buttons for minor security alerts.
 */
function createActionRow(targetId, expiresAt) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `security_action:timeout:${targetId}:${expiresAt}`
            )
            .setLabel('Timeout')
            .setEmoji('⏱️')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(
                `security_action:kick:${targetId}:${expiresAt}`
            )
            .setLabel('Kick')
            .setEmoji('👢')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(
                `security_action:ban:${targetId}:${expiresAt}`
            )
            .setLabel('Ban')
            .setEmoji('🔨')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(
                `security_action:remove_roles:${targetId}:${expiresAt}`
            )
            .setLabel('Remove Roles')
            .setEmoji('🎭')
            .setStyle(ButtonStyle.Secondary)
    );
}

/**
 * Disables security action buttons after expiration.
 */
async function expireButtons(message) {
    try {
        if (!message?.editable) {
            return;
        }

        const disabledRows = message.components.map(row => {
            const newRow = ActionRowBuilder.from(row);

            for (const component of newRow.components) {
                component.setDisabled(true);
            }

            return newRow;
        });

        await message.edit({
            components: disabledRows,
        });
    } catch {
        // Message may have been deleted.
    }
}

/**
 * Sends a security log.
 *
 * Supported options:
 *
 * actionPanel:
 * {
 *   targetId: '123',
 *   targetName: 'User#0001'
 * }
 */
export async function securityLog(
    client,
    {
        title = 'Security Alert',
        description = '',
        color = 0xFEE75C,
        fields = [],
        actionPanel = null,
        footer = 'FruityINC Security',
    } = {}
) {
    try {
        if (!client) {
            return null;
        }

        const channel =
            client.channels.cache.get(
                SECURITY_LOG_CHANNEL_ID
            ) ||
            await client.channels
                .fetch(SECURITY_LOG_CHANNEL_ID)
                .catch(() => null);

        if (!channel?.isTextBased?.()) {
            console.warn(
                `[Security] Security log channel ${SECURITY_LOG_CHANNEL_ID} was not found.`
            );

            return null;
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(
                description || 'Security event detected.'
            )
            .setFooter({
                text: footer,
            })
            .setTimestamp();

        if (Array.isArray(fields) && fields.length) {
            embed.addFields(
                fields.slice(0, 25)
            );
        }

        const payload = {
            embeds: [embed],
        };

        let expiresAt = null;

        if (
            actionPanel?.targetId
        ) {
            expiresAt =
                Date.now() +
                Number(
                    securityConfig.minorActionTimeoutMs ||
                    10 * 60 * 1000
                );

            payload.components = [
                createActionRow(
                    actionPanel.targetId,
                    expiresAt
                ),
            ];
        }

        const message = await channel.send(
            payload
        );

        /*
         * Automatically disable buttons.
         */
        if (expiresAt) {
            const timer = setTimeout(
                async () => {
                    minorActionTimers.delete(
                        message.id
                    );

                    await expireButtons(
                        message
                    );
                },
                Math.max(
                    1000,
                    expiresAt - Date.now()
                )
            );

            minorActionTimers.set(
                message.id,
                timer
            );
        }

        return message;
    } catch (error) {
        console.error(
            '[Security] Failed to send security log:',
            error
        );

        return null;
    }
}

export function getSecurityTargetName(
    value
) {
    return resolveName(value);
}
