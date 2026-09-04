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

    async execute(interaction, client) {

        if (!interaction.isModalSubmit()) {
            return;
        }

        // Suggestions must be submitted inside the server.
        if (!interaction.guild) {
            return interaction.reply({
                content:
                    '❌ Suggestions can only be submitted inside the server.',
                flags:
                    MessageFlags.Ephemeral,
            });
        }

        // Get suggestion text from the modal.
        const suggestionText =
            interaction.fields
                .getTextInputValue('suggestion_text')
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

        try {

            // Save suggestion.
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

            // Find admin channel.
            const adminChannel =
                await client.channels
                    .fetch(
                        SUGGESTION_CONFIG.adminChannelId
                    )
                    .catch(() => null);

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

            // Send suggestion to admin channel.
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

            // Save admin message ID.
            await updateSuggestion(
                interaction.guild.id,
                suggestion.id,
                {
                    adminMessageId:
                        adminMessage.id,
                }
            );

            // Confirmation shown to user.
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
                        value: '🟡 Pending',
                        inline: true,
                    })
                    .setFooter({
                        text:
                            'Fruity Suggestions',
                    });

            return interaction.reply({
                embeds: [
                    confirmation,
                ],

                flags:
                    MessageFlags.Ephemeral,
            });

        } catch (error) {

            console.error(
                '[Suggestions] Modal submission error:',
                error
            );

            if (interaction.replied || interaction.deferred) {
                return;
            }

            return interaction.reply({
                content:
                    '❌ Something went wrong while submitting your suggestion. Please try again.',
                flags:
                    MessageFlags.Ephemeral,
            });
        }
    },
};
