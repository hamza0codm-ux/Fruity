// src/interactions/modals/suggestions/suggestions.js

import {
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';

import {
    SUGGESTION_CONFIG,
    createSuggestion,
    updateSuggestion,
    buildAdminSuggestionEmbed,
    buildAdminSuggestionButtons,
} from '../../../suggestions/suggestions.js';


export default {

    name: 'suggestion_submit_modal',

    async execute(
        interaction,
        client
    ) {
        if (!interaction.isModalSubmit()) {
            return;
        }

        /*
         * Suggestions must be submitted
         * inside a server.
         */
        if (!interaction.guild) {
            return interaction.reply({
                content:
                    '❌ Suggestions can only be submitted inside the server.',

                flags:
                    MessageFlags.Ephemeral,
            });
        }

        /*
         * Get the suggestion text.
         */
        const suggestionText =
            interaction.fields
                .getTextInputValue(
                    'suggestion_text'
                )
                ?.trim();

        if (
            !suggestionText ||
            suggestionText.length < 5
        ) {
            return interaction.reply({
                content:
                    '❌ Your suggestion is too short. Please provide more detail.',

                flags:
                    MessageFlags.Ephemeral,
            });
        }

        /*
         * Save suggestion to database.
         */
        const suggestion =
            await createSuggestion({
                guildId:
                    interaction.guild.id,

                userId:
                    interaction.user.id,

                username:
                    interaction.user.tag,

                suggestion:
                    suggestionText,
            });

        /*
         * Find private admin channel.
         */
        const adminChannel =
            await client.channels
                .fetch(
                    SUGGESTION_CONFIG.adminChannelId
                )
                .catch(() => null);

        /*
         * If the admin channel cannot
         * be reached, the suggestion is
         * still saved.
         */
        if (
            !adminChannel ||
            !adminChannel.isTextBased()
        ) {
            return interaction.reply({
                content:
                    '❌ Your suggestion was saved, but the administration channel could not be reached. Please contact an administrator.',

                flags:
                    MessageFlags.Ephemeral,
            });
        }

        /*
         * Send suggestion to admins.
         */
        const adminMessage =
            await adminChannel.send({
                embeds: [
                    buildAdminSuggestionEmbed(
                        suggestion
                    ),
                ],

                components: [
                    buildAdminSuggestionButtons(
                        suggestion
                    ),
                ],
            });

        /*
         * Save the Discord message ID.
         */
        await updateSuggestion(
            interaction.guild.id,
            suggestion.id,
            {
                adminMessageId:
                    adminMessage.id,
            }
        );

        /*
         * Tell the user their suggestion
         * was successfully submitted.
         */
        const confirmation =
            new EmbedBuilder()
                .setColor(
                    SUGGESTION_CONFIG.color
                )
                .setTitle(
                    '✅ Suggestion Submitted'
                )
                .setDescription(
                    'Thank you for sharing your idea with FruityINC!\n\n' +
                    'Your suggestion has been sent to the administration team for review.'
                )
                .addFields({
                    name: 'Status',
                    value:
                        '🟡 Pending',
                    inline: true,
                })
                .setFooter({
                    text:
                        'Fruity Suggestions',
                });

        await interaction.reply({
            embeds: [
                confirmation,
            ],

            flags:
                MessageFlags.Ephemeral,
        });
    },
};
