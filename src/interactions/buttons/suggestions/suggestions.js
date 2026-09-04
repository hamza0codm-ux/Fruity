// src/interactions/buttons/suggestions/suggestions.js

import {
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from 'discord.js';

import {
    SUGGESTION_CONFIG,
    getSuggestions,
    getSuggestion,
    updateSuggestion,
    buildAdminSuggestionEmbed,
    buildAdminSuggestionButtons,
    getStatusEmoji,
    formatStatus,
} from '../../../suggestions/suggestions.js';


/*
|--------------------------------------------------------------------------
| SUBMIT BUTTON
|--------------------------------------------------------------------------
*/

export const suggestionSubmitButton = {
    name: 'suggestion_submit',

    async execute(interaction) {
        if (!interaction.isButton()) {
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('suggestion_submit_modal')
            .setTitle('Submit a Suggestion');

        const suggestionInput = new TextInputBuilder()
            .setCustomId('suggestion_text')
            .setLabel('Your Suggestion')
            .setPlaceholder(
                'Tell us your idea or suggestion...'
            )
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(5)
            .setMaxLength(4000)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                suggestionInput
            )
        );

        /*
         * showModal MUST be the first response
         * to this button interaction.
         */
        await interaction.showModal(modal);
    },
};


/*
|--------------------------------------------------------------------------
| MY STATUS BUTTON
|--------------------------------------------------------------------------
*/

export const suggestionStatusButton = {
    name: 'suggestion_status',

    async execute(interaction) {
        if (!interaction.isButton()) {
            return;
        }

        if (!interaction.guild) {
            return interaction.reply({
                content:
                    '❌ This button can only be used inside the server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const suggestions = await getSuggestions(
            interaction.guild.id
        );

        const mine = suggestions
            .filter(
                suggestion =>
                    suggestion.userId ===
                    interaction.user.id
            )
            .sort(
                (a, b) =>
                    new Date(b.createdAt) -
                    new Date(a.createdAt)
            );

        /*
         * No suggestions.
         */
        if (mine.length === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            SUGGESTION_CONFIG.color
                        )
                        .setTitle('My Suggestions')
                        .setDescription(
                            'You have not submitted any suggestions yet.\n\n' +
                            'Click **Submit** to send your first idea!'
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const shown = mine.slice(
            0,
            SUGGESTION_CONFIG.maxStatusResults
        );

        const description = shown
            .map((suggestion, index) => {
                const timestamp = Math.floor(
                    new Date(
                        suggestion.createdAt
                    ).getTime() / 1000
                );

                const suggestionText =
                    String(
                        suggestion.suggestion ?? ''
                    );

                const shortened =
                    suggestionText
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 180);

                const suffix =
                    suggestionText.length > 180
                        ? '...'
                        : '';

                return (
                    `**${index + 1}.** ` +
                    `${getStatusEmoji(
                        suggestion.status
                    )} **${formatStatus(
                        suggestion.status
                    )}**\n` +
                    `${shortened}${suffix}\n` +
                    `> <t:${timestamp}:R>`
                );
            })
            .join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(
                SUGGESTION_CONFIG.color
            )
            .setTitle('My Suggestions')
            .setDescription(description)
            .setFooter({
                text:
                    mine.length > shown.length
                        ? `Showing ${shown.length} of ${mine.length} suggestions`
                        : `${mine.length} suggestion${
                              mine.length === 1
                                  ? ''
                                  : 's'
                          }`,
            });

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
        });
    },
};


/*
|--------------------------------------------------------------------------
| APPROVE BUTTON
|--------------------------------------------------------------------------
*/

export const suggestionApproveButton = {
    name: 'suggestion_approve',

    async execute(
        interaction,
        client,
        args
    ) {
        if (!interaction.isButton()) {
            return;
        }

        /*
         * ADMIN ONLY
         */
        if (
            !interaction.member?.permissions?.has(
                'Administrator'
            )
        ) {
            return interaction.reply({
                content:
                    '❌ Only administrators can approve suggestions.',
                flags: MessageFlags.Ephemeral,
            });
        }

        /*
         * ONLY WORK IN THE ADMIN
         * SUGGESTION CHANNEL.
         */
        if (
            interaction.channelId !==
            SUGGESTION_CONFIG.adminChannelId
        ) {
            return interaction.reply({
                content:
                    '❌ Suggestions can only be managed in the suggestion administration channel.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const suggestionId = args?.[0];

        if (!suggestionId) {
            return interaction.reply({
                content:
                    '❌ Suggestion ID is missing.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const suggestion = await getSuggestion(
            interaction.guild.id,
            suggestionId
        );

        if (!suggestion) {
            return interaction.reply({
                content:
                    '❌ This suggestion could not be found.',
                flags: MessageFlags.Ephemeral,
            });
        }

        /*
         * Prevent approving an already
         * reviewed suggestion.
         */
        if (
            suggestion.status !== 'pending'
        ) {
            return interaction.reply({
                content:
                    `❌ This suggestion has already been ${suggestion.status}.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        /*
         * Update database.
         */
        const updated =
            await updateSuggestion(
                interaction.guild.id,
                suggestionId,
                {
                    status: 'accepted',
                    reviewedAt:
                        new Date().toISOString(),
                    reviewedBy:
                        interaction.user.id,
                }
            );

        /*
         * Update the original admin
         * suggestion message.
         */
        await interaction.update({
            embeds: [
                buildAdminSuggestionEmbed(
                    updated
                ),
            ],
            components: [
                buildAdminSuggestionButtons(
                    updated
                ),
            ],
        });

        /*
         * Notify the user privately.
         */
        try {
            const user =
                await client.users.fetch(
                    updated.userId
                );

            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle(
                            '🟢 Your Suggestion Was Accepted'
                        )
                        .setDescription(
                            updated.suggestion
                        )
                        .setFooter({
                            text:
                                'Fruity Suggestions',
                        }),
                ],
            });
        } catch {
            /*
             * User has DMs disabled or
             * cannot be contacted.
             */
        }
    },
};


/*
|--------------------------------------------------------------------------
| DENY BUTTON
|--------------------------------------------------------------------------
*/

export const suggestionDenyButton = {
    name: 'suggestion_deny',

    async execute(
        interaction,
        client,
        args
    ) {
        if (!interaction.isButton()) {
            return;
        }

        /*
         * ADMIN ONLY
         */
        if (
            !interaction.member?.permissions?.has(
                'Administrator'
            )
        ) {
            return interaction.reply({
                content:
                    '❌ Only administrators can deny suggestions.',
                flags: MessageFlags.Ephemeral,
            });
        }

        /*
         * ONLY WORK IN THE ADMIN
         * SUGGESTION CHANNEL.
         */
        if (
            interaction.channelId !==
            SUGGESTION_CONFIG.adminChannelId
        ) {
            return interaction.reply({
                content:
                    '❌ Suggestions can only be managed in the suggestion administration channel.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const suggestionId = args?.[0];

        if (!suggestionId) {
            return interaction.reply({
                content:
                    '❌ Suggestion ID is missing.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const suggestion = await getSuggestion(
            interaction.guild.id,
            suggestionId
        );

        if (!suggestion) {
            return interaction.reply({
                content:
                    '❌ This suggestion could not be found.',
                flags: MessageFlags.Ephemeral,
            });
        }

        /*
         * Prevent denying an already
         * reviewed suggestion.
         */
        if (
            suggestion.status !== 'pending'
        ) {
            return interaction.reply({
                content:
                    `❌ This suggestion has already been ${suggestion.status}.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        /*
         * Update database.
         */
        const updated =
            await updateSuggestion(
                interaction.guild.id,
                suggestionId,
                {
                    status: 'denied',
                    reviewedAt:
                        new Date().toISOString(),
                    reviewedBy:
                        interaction.user.id,
                }
            );

        /*
         * Update the original admin
         * suggestion message.
         */
        await interaction.update({
            embeds: [
                buildAdminSuggestionEmbed(
                    updated
                ),
            ],
            components: [
                buildAdminSuggestionButtons(
                    updated
                ),
            ],
        });

        /*
         * Notify the user privately.
         */
        try {
            const user =
                await client.users.fetch(
                    updated.userId
                );

            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle(
                            '🔴 Your Suggestion Was Denied'
                        )
                        .setDescription(
                            updated.suggestion
                        )
                        .setFooter({
                            text:
                                'Fruity Suggestions',
                        }),
                ],
            });
        } catch {
            /*
             * User has DMs disabled or
             * cannot be contacted.
             */
        }
    },
};


/*
|--------------------------------------------------------------------------
| DEFAULT EXPORT
|--------------------------------------------------------------------------
|
| This keeps the array export format your button loader
| may already be using.
|
*/

export default [
    suggestionSubmitButton,
    suggestionStatusButton,
    suggestionApproveButton,
    suggestionDenyButton,
];
