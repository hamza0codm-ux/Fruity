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


    /*
     * PUBLIC BUTTONS
     */

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
            embed,
        ],

        components: [
            buttons,
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
     * REVIEWED BY
     */

    if (suggestion.reviewedBy) {
        embed.addFields({
            name: 'Reviewed By',

            value:
                `<@${suggestion.reviewedBy}>`,

            inline: false,
        });
    }


    /*
     * REVIEWED AT
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

            inline: false,
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
| PANEL COMPARISON
|--------------------------------------------------------------------------
|
| Discord can return extra/default properties on components and embeds.
|
| We only compare properties that are actually controlled by this bot.
|
| Same panel:
|     -> NO EDIT
|
| Changed panel:
|     -> EDIT
|
| Missing panel:
|     -> CREATE
|
|--------------------------------------------------------------------------
*/


function normalizeEmoji(emoji) {
    if (!emoji) {
        return null;
    }

    return {
        id: emoji.id ?? null,
        name: emoji.name ?? null,
        animated: Boolean(
            emoji.animated
        ),
    };
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
        title:
            data.title ?? null,

        description:
            data.description ?? null,

        color:
            data.color ?? null,

        url:
            data.url ?? null,

        image:
            data.image?.url
                ? {
                    url:
                        data.image.url,
                }
                : null,

        thumbnail:
            data.thumbnail?.url
                ? {
                    url:
                        data.thumbnail.url,
                }
                : null,

        footer:
            data.footer
                ? {
                    text:
                        data.footer.text ?? null,

                    icon_url:
                        data.footer.icon_url ??
                        data.footer.iconURL ??
                        null,
                }
                : null,

        author:
            data.author
                ? {
                    name:
                        data.author.name ?? null,

                    url:
                        data.author.url ?? null,

                    icon_url:
                        data.author.icon_url ??
                        data.author.iconURL ??
                        null,
                }
                : null,

        fields:
            (data.fields ?? [])
                .map(field => ({
                    name:
                        field.name ?? null,

                    value:
                        field.value ?? null,

                    inline:
                        Boolean(
                            field.inline
                        ),
                })),
    };
}


function normalizeComponent(
    component
) {
    if (!component) {
        return null;
    }

    const data =
        typeof component.toJSON === 'function'
            ? component.toJSON()
            : component;


    return {
        type:
            data.type ?? null,

        custom_id:
            data.custom_id ??
            data.customId ??
            null,

        style:
            data.style ?? null,

        label:
            data.label ?? null,

        disabled:
            Boolean(
                data.disabled
            ),

        emoji:
            normalizeEmoji(
                data.emoji
            ),

        url:
            data.url ?? null,

        sku_id:
            data.sku_id ??
            data.skuId ??
            null,
    };
}


function normalizePanel(
    messageOrPayload
) {
    return {
        content:
            messageOrPayload.content ?? null,

        embeds:
            (messageOrPayload.embeds ?? [])
                .map(normalizeEmbed),

        components:
            (messageOrPayload.components ?? [])
                .map(row => {

                    const rowData =
                        typeof row.toJSON === 'function'
                            ? row.toJSON()
                            : row;


                    return {
                        type:
                            rowData.type ?? null,

                        components:
                            (
                                rowData.components ?? []
                            ).map(
                                normalizeComponent
                            ),
                    };
                }),
    };
}


/*
|--------------------------------------------------------------------------
| STABLE PANEL FINGERPRINT
|--------------------------------------------------------------------------
*/

function getPanelFingerprint(
    panel
) {
    return JSON.stringify(
        normalizePanel(panel)
    );
}


/*
|--------------------------------------------------------------------------
| CHECK IF PANELS ARE IDENTICAL
|--------------------------------------------------------------------------
*/

function panelsAreEqual(
    existingMessage,
    desiredPayload
) {
    const existingFingerprint =
        getPanelFingerprint(
            existingMessage
        );

    const desiredFingerprint =
        getPanelFingerprint(
            desiredPayload
        );


    return (
        existingFingerprint ===
        desiredFingerprint
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

        /*
         * FETCH CHANNEL
         */

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


        /*
         * BUILD DESIRED PANEL
         */

        const payload =
            buildSuggestionPanel();


        /*
         * FETCH RECENT MESSAGES
         */

        const messages =
            await channel.messages.fetch({
                limit: 50,
            });


        /*
         * FIND EXISTING PUBLIC PANEL
         */

        const existing =
            messages.find(
                message => {

                    /*
                     * Only our bot's messages.
                     */

                    if (
                        message.author?.id !==
                        client.user?.id
                    ) {
                        return false;
                    }


                    /*
                     * Identify the panel by
                     * its Submit button.
                     */

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
         * EXISTING PANEL
         */

        if (existing) {

            /*
             * Check whether it is actually different.
             */

            const panelChanged =
                !panelsAreEqual(
                    existing,
                    payload
                );


            /*
             * IMPORTANT:
             *
             * If absolutely nothing changed,
             * DO NOT call .edit().
             *
             * This prevents Discord from showing
             * "(edited)" after every restart.
             */

            if (!panelChanged) {

                logger.info(
                    `Suggestions panel unchanged in #${channel.name}; skipping edit.`
                );

                return existing;
            }


            /*
             * Something really changed.
             *
             * Update the panel.
             */

            logger.info(
                `Suggestions panel changed in #${channel.name}; updating.`
            );


            await existing.edit(
                payload
            );


            logger.info(
                `Suggestions panel updated in #${channel.name}.`
            );


            return existing;
        }


        /*
         * PANEL DOES NOT EXIST
         *
         * CREATE IT.
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
