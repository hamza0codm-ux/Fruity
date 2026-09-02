import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    isLoggingEnabled,
    setLoggingEnabled,
} from '../../services/loggingService.js';

import {
    logger,
} from '../../utils/logger.js';


export default {
    data: new SlashCommandBuilder()

        .setName('logging')

        .setDescription(
            'Control server logging.'
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )

        .setDMPermission(false)


        .addSubcommand(
            subcommand =>
                subcommand
                    .setName('on')
                    .setDescription(
                        'Turn server logging on.'
                    )
        )


        .addSubcommand(
            subcommand =>
                subcommand
                    .setName('off')
                    .setDescription(
                        'Turn server logging off.'
                    )
        )


        .addSubcommand(
            subcommand =>
                subcommand
                    .setName('status')
                    .setDescription(
                        'Check logging status.'
                    )
        ),


    category: 'logging',


    async execute(
        interaction,
        config,
        client
    ) {
        try {

            if (!interaction.guildId) {
                return interaction.reply({
                    content:
                        '❌ This command can only be used in a server.',

                    ephemeral:
                        true,
                });
            }


            const subcommand =
                interaction.options
                    .getSubcommand();


            // =====================================================
            // ON
            // =====================================================

            if (
                subcommand === 'on'
            ) {

                await setLoggingEnabled(
                    client,
                    interaction.guildId,
                    true
                );


                return interaction.reply({
                    content:
                        '🟢 **Logging has been enabled.**',

                    ephemeral:
                        true,
                });
            }


            // =====================================================
            // OFF
            // =====================================================

            if (
                subcommand === 'off'
            ) {

                await setLoggingEnabled(
                    client,
                    interaction.guildId,
                    false
                );


                return interaction.reply({
                    content:
                        '🔴 **Logging has been disabled.**',

                    ephemeral:
                        true,
                });
            }


            // =====================================================
            // STATUS
            // =====================================================

            if (
                subcommand === 'status'
            ) {

                const enabled =
                    await isLoggingEnabled(
                        client,
                        interaction.guildId
                    );


                return interaction.reply({
                    content:
                        enabled
                            ? '🟢 **Logging is currently ON.**'
                            : '🔴 **Logging is currently OFF.**',

                    ephemeral:
                        true,
                });
            }

        } catch (error) {

            logger.error(
                'Logging command error:',
                error
            );


            const message =
                '❌ An error occurred while changing the logging setting.';


            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction.editReply({
                    content:
                        message,
                });
            }


            return interaction.reply({
                content:
                    message,

                ephemeral:
                    true,
            });
        }
    },
};
