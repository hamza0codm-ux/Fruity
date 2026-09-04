import {
    Events,
    EmbedBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    getColor,
    botConfig,
} from '../config/bot.js';

import {
    logEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    logger,
} from '../utils/logger.js';


/*
|--------------------------------------------------------------------------
| WELCOME CONFIGURATION
|--------------------------------------------------------------------------
|
| Everything for the welcome system is configured here.
|
*/

const WELCOME_CHANNEL_ID = 'YOUR_WELCOME_CHANNEL_ID';


/*
|--------------------------------------------------------------------------
| AUTO ROLE
|--------------------------------------------------------------------------
|
| This role is automatically given to every new member.
|
*/

const AUTO_ROLE_ID = '1541554587658625104';


/*
|--------------------------------------------------------------------------
| WELCOME LINKS
|--------------------------------------------------------------------------
*/

const WELCOME_LINKS = [
    {
        name: 'Server Rules',
        emoji: '📜',
        url: 'https://discord.com/channels/1541083989786370080/1541550498925256744',
    },
    {
        name: 'Information',
        emoji: '📚',
        url: 'https://discord.com/channels/1541083989786370080/1545439852487778455',
    },
    {
        name: 'Tickets',
        emoji: '🎫',
        url: 'https://discord.com/channels/1541083989786370080/1541550578495127592',
    },
    {
        name: 'Community',
        emoji: '💬',
        url: 'https://discord.com/channels/1541083989786370080/1543030791599300759',
    },
    {
        name: 'Announcements',
        emoji: '📢',
        url: 'https://discord.com/channels/1541083989786370080/1541551382958579782',
    },
];


/*
|--------------------------------------------------------------------------
| MAIN EVENT
|--------------------------------------------------------------------------
*/

export default {
    name: Events.GuildMemberAdd,

    async execute(member) {

        const guild = member.guild;
        const user = member.user;

        if (!guild || !user) {
            return;
        }


        /*
        |--------------------------------------------------------------------------
        | WELCOME MESSAGE
        |--------------------------------------------------------------------------
        */

        try {

            const welcomeChannel =
                guild.channels.cache.get(
                    WELCOME_CHANNEL_ID
                );


            if (!welcomeChannel) {

                logger.warn(
                    `Welcome channel ${WELCOME_CHANNEL_ID} was not found in guild ${guild.id}.`
                );

            } else {

                const permissions =
                    welcomeChannel.permissionsFor(
                        guild.members.me
                    );


                const canView =
                    permissions?.has(
                        PermissionFlagsBits.ViewChannel
                    );

                const canSend =
                    permissions?.has(
                        PermissionFlagsBits.SendMessages
                    );


                if (!canView || !canSend) {

                    logger.warn(
                        `Bot cannot send welcome message in ${welcomeChannel.name} (${guild.id}).`
                    );

                } else {

                    /*
                    |--------------------------------------------------------------------------
                    | WELCOME DESCRIPTION
                    |--------------------------------------------------------------------------
                    */

                    const description = [
                        `We’re so excited to have you join us, make sure to check out all the essential channels to get the full experience!`,
                        '',
                        ...WELCOME_LINKS.map(
                            link =>
                                `${link.emoji} [${link.name}](${link.url})`
                        ),
                        '',
                        `Hope you enjoy your stay here ❤️`,
                    ].join('\n');


                    /*
                    |--------------------------------------------------------------------------
                    | WELCOME EMBED
                    |--------------------------------------------------------------------------
                    */

                    const embed =
                        new EmbedBuilder()
                            .setColor(
                                getColor()
                            )
                            .setTitle(
                                '👋 Welcome to Fruity!'
                            )
                            .setDescription(
                                description
                            )
                            .setThumbnail(
                                user.displayAvatarURL({
                                    dynamic: true,
                                    size: 256,
                                })
                            )
                            .addFields(
                                {
                                    name: 'User',
                                    value: user.toString(),
                                    inline: true,
                                },
                                {
                                    name: 'Member Count',
                                    value: guild.memberCount.toString(),
                                    inline: true,
                                }
                            )
                            .setTimestamp()
                            .setFooter({
                                text:
                                    `Welcome to ${guild.name}!`,
                            });


                    /*
                    |--------------------------------------------------------------------------
                    | OPTIONAL IMAGE
                    |--------------------------------------------------------------------------
                    |
                    | If you have a welcome image configured in bot.js,
                    | it will still be used.
                    |
                    */

                    const welcomeImage =
                        botConfig.welcome?.welcomeImage;


                    if (
                        typeof welcomeImage === 'string' &&
                        welcomeImage.trim()
                    ) {

                        embed.setImage(
                            welcomeImage.trim()
                        );
                    }


                    /*
                    |--------------------------------------------------------------------------
                    | SEND MESSAGE
                    |--------------------------------------------------------------------------
                    |
                    | The member gets a normal Discord ping.
                    | The actual welcome content is the embed.
                    |
                    */

                    await welcomeChannel.send({

                        content:
                            user.toString(),

                        allowedMentions: {
                            users: [
                                user.id,
                            ],
                        },

                        embeds: [
                            embed,
                        ],

                    });


                    logger.info(
                        `Sent welcome message for ${user.tag} in ${guild.name}.`
                    );
                }
            }

        } catch (error) {

            logger.error(
                `Failed to send welcome message for ${user.tag}:`,
                error
            );
        }


        /*
        |--------------------------------------------------------------------------
        | AUTO ROLE
        |--------------------------------------------------------------------------
        */

        try {

            const role =
                guild.roles.cache.get(
                    AUTO_ROLE_ID
                );


            if (!role) {

                logger.warn(
                    `Auto role ${AUTO_ROLE_ID} was not found in guild ${guild.id}.`
                );

            } else {

                await assignRoleSafely(
                    member,
                    role
                );
            }

        } catch (error) {

            logger.error(
                `Failed to process auto role for ${user.tag}:`,
                error
            );
        }


        /*
        |--------------------------------------------------------------------------
        | MEMBER JOIN LOG
        |--------------------------------------------------------------------------
        */

        try {

            await logEvent(
                guild,
                EVENT_TYPES.MEMBER_JOIN,
                {
                    member,
                }
            );

        } catch (error) {

            logger.error(
                `Failed to log member join for ${user.tag}:`,
                error
            );
        }
    },
};


/*
|--------------------------------------------------------------------------
| AUTO ROLE HELPER
|--------------------------------------------------------------------------
*/

async function assignRoleSafely(
    member,
    role
) {

    try {

        if (!member?.guild) {
            return false;
        }


        if (!role) {
            return false;
        }


        /*
        |--------------------------------------------------------------------------
        | ALREADY HAS ROLE
        |--------------------------------------------------------------------------
        */

        if (
            member.roles.cache.has(
                role.id
            )
        ) {

            return true;
        }


        /*
        |--------------------------------------------------------------------------
        | BOT MEMBER
        |--------------------------------------------------------------------------
        */

        const botMember =
            member.guild.members.me;


        if (!botMember) {

            logger.warn(
                `Could not resolve bot member in guild ${member.guild.id}.`
            );

            return false;
        }


        /*
        |--------------------------------------------------------------------------
        | ROLE HIERARCHY
        |--------------------------------------------------------------------------
        */

        if (!role.editable) {

            logger.warn(
                `Cannot assign role ${role.name} (${role.id}) because the role is higher than or equal to the bot's highest role.`
            );

            return false;
        }


        /*
        |--------------------------------------------------------------------------
        | ASSIGN ROLE
        |--------------------------------------------------------------------------
        */

        await member.roles.add(
            role,
            'Automatic role assignment on member join'
        );


        logger.info(
            `Assigned auto role ${role.name} (${role.id}) to ${member.user.tag}.`
        );


        return true;

    } catch (error) {

        logger.error(
            `Failed to assign auto role ${role?.id || 'unknown'} to ${member?.user?.tag || 'unknown user'}:`,
            error
        );

        return false;
    }
}
