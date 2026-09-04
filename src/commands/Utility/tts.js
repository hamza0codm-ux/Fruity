import {
    PermissionFlagsBits,
} from 'discord.js';

import {
    isTTSEnabled,
    setTTSEnabled,
    speakInVoiceChannel,
    disconnectTTS,
} from '../../services/ttsService.js';

export default {
    name: 'tts',
    category: 'Utility',

    data: {
        name: 'tts',
        description: 'Control the server TTS system.',
        default_member_permissions:
            PermissionFlagsBits.MuteMembers.toString(),
    },

    async execute(interaction) {
        await interaction.reply({
            content:
                'TTS is controlled with the prefix command. Use `,tts on` or `,tts off`.',
            ephemeral: true,
        });
    },

    async prefixExecute(message, args) {
        const guildId = message.guild.id;
        const subcommand = args[0]?.toLowerCase();

        /*
         * ,tts on
         */
        if (subcommand === 'on' && args.length === 1) {
            if (
                !message.member.permissions.has(
                    PermissionFlagsBits.MuteMembers
                ) &&
                !message.member.permissions.has(
                    PermissionFlagsBits.DeafenMembers
                )
            ) {
                await message.channel.send(
                    '❌ You need **Mute Members** or **Deafen Members** permission to enable TTS.'
                );

                return;
            }

            setTTSEnabled(guildId, true);

            await message.channel.send(
                '🔊 TTS has been **enabled**. Use `,your message` to speak.'
            );

            return;
        }

        /*
         * ,tts off
         */
        if (subcommand === 'off' && args.length === 1) {
            if (
                !message.member.permissions.has(
                    PermissionFlagsBits.MuteMembers
                ) &&
                !message.member.permissions.has(
                    PermissionFlagsBits.DeafenMembers
                )
            ) {
                await message.channel.send(
                    '❌ You need **Mute Members** or **Deafen Members** permission to disable TTS.'
                );

                return;
            }

            setTTSEnabled(guildId, false);
            disconnectTTS(guildId);

            await message.channel.send(
                '🔇 TTS has been **disabled**.'
            );

            return;
        }

        await message.channel.send(
            'ℹ️ Usage: `,tts on` or `,tts off`'
        );
    },
};
