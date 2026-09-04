// src/suggestions/suggestions.js

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';

import {
    getFromDb,
    setInDb,
} from '../utils/database.js';

import { logger } from '../utils/logger.js';


/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

export const SUGGESTION_CONFIG = {
    panelChannelId: '1545071209429999736',

    adminChannelId: '1545354349574758450',

    panelImageUrl: '',

    color: 0xF8D568,

    maxStatusResults: 10,
};


/*
|--------------------------------------------------------------------------
| CUSTOM EMOJIS
|--------------------------------------------------------------------------
*/

export const SUGGESTION_EMOJIS = {
    submit: {
        id: '1425715843211460628',
        name: 'b_black',
        animated: true,
    },

    status: {
        id: '1467672726196977665',
        name: 'loading_bg',
        animated: true,
    },
};


/*
|--------------------------------------------------------------------------
| DATABASE
|--------------------------------------------------------------------------
*/

function getSuggestionKey(guildId) {
    return `guild:${guildId}:suggestions`;
}


export async function getSuggestions(guildId) {
    try {
        const suggestions = await getFromDb(
            getSuggestionKey(guildId),
            []
        );

        return Array.isArray(suggestions)
            ? suggestions
            : [];

    } catch (error) {

        logger.error(
            `Failed to get suggestions for guild ${guildId}:`,
            error
        );

        return [];
    }
}


export async function saveSuggestions(
    guildId,
    suggestions
) {
    try {

        await setInDb(
            getSuggestionKey(guildId),
            suggestions
        );

        return true;

    } catch (error) {

        logger.error(
            `Failed to save suggestions for guild ${guildId}:`,
            error
        );

        return false;
    }
}


export async function getSuggestion(
    guildId,
    suggestionId
) {
    const suggestions =
        await getSuggestions(guildId);

    return (
        suggestions.find(
            suggestion =>
                suggestion.id === suggestionId
        ) || null
    );
}


/*
|--------------------------------------------------------------------------
| CREATE SUGGESTION
|--------------------------------------------------------------------------
*/

export async function createSuggestion({
    guildId,
    userId,
    username,
    suggestion,
}) {

    const suggestions =
        await getSuggestions(guildId);

    /*
     * Internal ID.
     *
     * This is NOT displayed to users.
     *
     * It is required internally so the
     * Approve/Deny buttons know which
     * suggestion they belong to.
     */
    const id =
        `${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

    const record = {

        id,

        guildId,

        userId,

        username,

        suggestion,

        status: 'pending',

        createdAt:
            new Date().toISOString(),

        reviewedAt: null,

        reviewedBy: null,

        adminMessageId: null,

        adminChannelId:
            SUGGESTION_CONFIG.adminChannelId,
    };

    suggestions.push(record);

    await saveSuggestions(
        guildId,
        suggestions
    );

    return record;
}


/*
|--------------------------------------------------------------------------
| UPDATE SUGGESTION
|--------------------------------------------------------------------------
*/

export async function updateSuggestion(
    guildId,
    suggestionId,
    updates
) {

    const suggestions =
        await getSuggestions(guildId);

    const index =
        suggestions.findIndex(
            suggestion =>
                suggestion.id ===
                suggestionId
        );

    if (index === -1) {
        return null;
    }

    suggestions[index] = {
        ...suggestions[index],
        ...updates,
    };

    await saveSuggestions(
        guildId,
        suggestions
    );

    return suggestions[index];
}


/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

export function getStatusLabel(status) {

    switch (status) {

        case 'accepted':
            return '🟢 Accepted';

        case 'denied':
            return '🔴 Denied';

        case 'pending':
        default:
            return '🟡 Pending';
    }
}


export function getStatusEmoji(status) {

    switch (status) {

        case 'accepted':
            return '🟢';

        case 'denied':
            return '🔴';

        case 'pending':
        default:
            return '🟡';
    }
}


export function formatStatus(status) {

    switch (status) {

        case 'accepted':
            return 'Accepted';

        case 'denied':
            return 'Denied';

        case 'pending':
        default:
            return 'Pending';
    }
}


/*
|--------------------------------------------------------------------------
| PUBLIC SUGGESTION PANEL
|--------------------------------------------------------------------------
*/

export function buildSuggestionPanel() {

    const embed =
        new EmbedBuilder()
            .setColor(
                SUGGESTION_CONFIG.color
            )
            .setTitle(
                'Have your ideas heard at Fruity'
            )
            .setDescription(
                'Have an idea, improvement, or suggestion for Fruity?\n\n' +
                'We want to hear what you think. Submit your idea below and our team will review it.'
            );

    /*
     * Optional panel image.
     */

    if (
        SUGGESTION_CONFIG.panelImageUrl &&
        /^https?:\/\//i.test(
            SUGGESTION_CONFIG.panelImageUrl
        )
    ) {

        embed.setImage(
            SUGGESTION_CONFIG.panelImageUrl
        );
    }


    const buttons =
        new ActionRowBuilder()
            .addComponents(

                /*
                 * SUBMIT
                 */

                new ButtonBuilder()
                    .setCustomId(
                        'suggestion_submit'
                    )
                    .setLabel(
                        'Submit'
                    )
                    .setEmoji(
                        SUGGESTION_EMOJIS.submit
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                /*
                 * MY STATUS
                 */

                new ButtonBuilder()
                    .setCustomId(
                        'suggestion_status'
                    )
                    .setLabel(
                        'My Status'
                    )
                    .setEmoji(
                        SUGGESTION_EMOJIS.status
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            );


    return {
        embeds: [
            embed
        ],

        components: [
            buttons
        ],
    };
}


/*
|--------------------------------------------------------------------------
| ADMIN SUGGESTION EMBED
|--------------------------------------------------------------------------
*/

export function buildAdminSuggestionEmbed(
    suggestion
) {

    let color =
        SUGGESTION_CONFIG.color;


    if (
        suggestion.status ===
        'accepted'
    ) {

        color = 0x57F287;
    }


    if (
        suggestion.status ===
        'denied'
    ) {

        color = 0xED4245;
    }


    const embed =
        new EmbedBuilder()
            .setColor(color)

            .setTitle(
                '💡 New Fruity Suggestion'
            )

            .setDescription(
                suggestion.suggestion
            )

            .addFields(
                {
                    name: 'Submitted By',

                    value:
                        `<@${suggestion.userId}>`,

                    inline: true,
                },

                {
                    name: 'Status',

                    value:
                        getStatusLabel(
                            suggestion.status
                        ),

                    inline: true,
                }
            )

            .setTimestamp(
                new Date(
                    suggestion.createdAt
                )
            )

            .setFooter({
                text:
                    'Fruity Suggestions',
            });


    /*
     * Reviewed By
     */

    if (suggestion.reviewedBy) {

        embed.addFields({
            name: 'Reviewed By',

            value:
                `<@${suggestion.reviewedBy}>`,

            inline: true,
        });
    }


    /*
     * Reviewed At
     */

    if (suggestion.reviewedAt) {

        embed.addFields({
            name: 'Reviewed At',

            value:
                `<t:${Math.floor(
                    new Date(
                        suggestion.reviewedAt
                    ).getTime() / 1000
                )}:F>`,

            inline: true,
        });
    }


    return embed;
}


/*
|--------------------------------------------------------------------------
| ADMIN BUTTONS
|--------------------------------------------------------------------------
*/

export function buildAdminSuggestionButtons(
    suggestion
) {

    const finished =
        suggestion.status === 'accepted' ||
        suggestion.status === 'denied';


    return new ActionRowBuilder()
        .addComponents(

            /*
             * APPROVE
             */

            new ButtonBuilder()
                .setCustomId(
                    `suggestion_approve:${suggestion.id}`
                )
                .setLabel(
                    'Approve'
                )
                .setEmoji(
                    '✅'
                )
                .setStyle(
                    ButtonStyle.Success
                )
                .setDisabled(
                    finished
                ),

            /*
             * DENY
             */

            new ButtonBuilder()
                .setCustomId(
                    `suggestion_deny:${suggestion.id}`
                )
                .setLabel(
                    'Deny'
                )
                .setEmoji(
                    '❌'
                )
                .setStyle(
                    ButtonStyle.Danger
                )
                .setDisabled(
                    finished
                )
        );
}


/*
|--------------------------------------------------------------------------
| AUTO CREATE / UPDATE PANEL
|--------------------------------------------------------------------------
*/

export async function reconcileSuggestionPanel(
    client
) {

    const channelId =
        SUGGESTION_CONFIG.panelChannelId;


    if (
        !channelId ||
        channelId ===
            'PUT_SUGGESTION_PANEL_CHANNEL_ID_HERE'
    ) {

        logger.warn(
            'Suggestions: panelChannelId has not been configured.'
        );

        return null;
    }


    try {

        const channel =
            await client.channels.fetch(
                channelId
            );


        if (
            !channel ||
            !channel.isTextBased()
        ) {

            logger.warn(
                `Suggestions: channel ${channelId} is invalid or not text based.`
            );

            return null;
        }


        const payload =
            buildSuggestionPanel();


        const messages =
            await channel.messages.fetch({
                limit: 50,
            });


        /*
         * Find existing panel.
         */

        const existing =
            messages.find(
                message => {

                    if (
                        message.author?.id !==
                        client.user?.id
                    ) {
                        return false;
                    }


                    return message.components?.some(
                        row =>
                            row.components?.some(
                                component =>
                                    component.customId ===
                                    'suggestion_submit'
                            )
                    );
                }
            );


        /*
         * UPDATE EXISTING PANEL
         */

        if (existing) {

            await existing.edit(
                payload
            );

            logger.info(
                `Suggestions panel updated in #${channel.name}.`
            );

            return existing;
        }


        /*
         * CREATE NEW PANEL
         */

        const message =
            await channel.send(
                payload
            );


        logger.info(
            `Suggestions panel created in #${channel.name}.`
        );


        return message;


    } catch (error) {

        logger.error(
            'Suggestions: failed to reconcile panel:',
            error
        );

        return null;
    }
}
