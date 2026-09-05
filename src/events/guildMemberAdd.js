import {
    Events,
    EmbedBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
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
*/

const WELCOME_CHANNEL_ID = '1541550434077114418';


/*
|--------------------------------------------------------------------------
| AUTO ROLE
|--------------------------------------------------------------------------
*/

const AUTO_ROLE_ID = '1541554587658625104';


/*
|--------------------------------------------------------------------------
| MAIN EVENT
|--------------------------------------------------------------------------
*/

export default {
    name: Events.GuildMemberAdd,

    async execute(member) {

        try {

            /*
            |--------------------------------------------------------------------------
            | BASIC VALIDATION
            |--------------------------------------------------------------------------
            */

            if (!member) {
                logger.warn(
                    'guildMemberAdd fired without a member.'
                );

                return;
            }

            const guild = member.guild;
            const user = member.user;

            if (!guild || !user) {
                logger.warn(
                    'guildMemberAdd fired without a valid guild or user.'
                );

                return;
            }


            logger.info(
                `New member joined ${guild.name}: ${user.tag} (${user.id})`
            );


            /*
            |--------------------------------------------------------------------------
            | WELCOME CHANNEL
            |--------------------------------------------------------------------------
            */

            const welcomeChannel =
                await guild.channels.fetch(
                    WELCOME_CHANNEL_ID
                ).catch(() => null);


            if (!welcomeChannel) {

                logger.warn(
                    `Welcome channel ${WELCOME_CHANNEL_ID} could not be found in guild ${guild.id}.`
                );

            } else {

                /*
                |--------------------------------------------------------------------------
                | CHECK BOT MEMBER
                |--------------------------------------------------------------------------
                */

                const botMember =
                    guild.members.me ||
                    await guild.members.fetch(
                        guild.client.user.id
                    ).catch(() => null);


                if (!botMember) {

                    logger.warn(
                        `Could not find the bot member in ${guild.name}.`
                    );

                } else {

                    /*
                    |--------------------------------------------------------------------------
                    | CHECK PERMISSIONS
                    |--------------------------------------------------------------------------
                    */

                    const permissions =
                        welcomeChannel.permissionsFor(
                            botMember
                        );


                    const canView =
                        permissions?.has(
                            PermissionFlagsBits.ViewChannel
                        );

                    const canSend =
                        permissions?.has(
                            PermissionFlagsBits.SendMessages
                        );


                    if (!canView) {

                        logger.warn(
                            `Bot does not have ViewChannel permission in #${welcomeChannel.name}.`
                        );

                    } else if (!canSend) {

                        logger.warn(
                            `Bot does not have SendMessages permission in #${welcomeChannel.name}.`
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
                            'https://discord.com/channels/1541083989786370080/1541550498925256744',
                            'https://discord.com/channels/1541083989786370080/1545439852487778455',
                            'https://discord.com/channels/1541083989786370080/1541550578495127592',
                            'https://discord.com/channels/1541083989786370080/1543030791599300759',
                            'https://discord.com/channels/1541083989786370080/1541551382958579782',
                            '',
                            'Hope you enjoy your stay here ❤️',
                        ].join('\n');


                        /*
                        |--------------------------------------------------------------------------
                        | WELCOME EMBED
                        |--------------------------------------------------------------------------
                        */

                        const embed =
                            new EmbedBuilder()
                                .setColor(0xF8D568)
                                .setTitle(
                                    ' 👋 Welcome to Fruity!'
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
                                        value:
                                            guild.memberCount.toString(),
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
                        | OPTIONAL WELCOME IMAGE
                        |--------------------------------------------------------------------------
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
                        | SEND WELCOME MESSAGE
                        |--------------------------------------------------------------------------
                        |
                        | The member is pinged normally.
                        | The actual welcome message is the embed.
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
                            `Welcome message sent for ${user.tag} in ${guild.name}.`
                        );
                    }
                }
            }


            /*
            |--------------------------------------------------------------------------
            | AUTO ROLE
            |--------------------------------------------------------------------------
            */

            const role =
                await guild.roles.fetch(
                    AUTO_ROLE_ID
                ).catch(() => null);


            if (!role) {

                logger.warn(
                    `Auto role ${AUTO_ROLE_ID} could not be found in ${guild.name}.`
                );

            } else {

                await assignRoleSafely(
                    member,
                    role
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

        } catch (error) {

            logger.error(
                `guildMemberAdd failed for ${member?.user?.tag || 'unknown user'}:`,
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

        if (!member?.guild || !role) {
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

            logger.info(
                `${member.user.tag} already has ${role.name}.`
            );

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
                `Could not resolve bot member in ${member.guild.name}.`
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
                `Cannot assign ${role.name} to ${member.user.tag}. ` +
                `The role must be BELOW the bot's highest role.`
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
            `Assigned ${role.name} (${role.id}) to ${member.user.tag}.`
        );


        return true;

    } catch (error) {

        logger.error(
            `Failed to assign role ${role?.name || role?.id || 'unknown'} ` +
            `to ${member?.user?.tag || 'unknown user'}:`,
            error
        );

        return false;
    }
}
