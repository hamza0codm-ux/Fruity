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
    getGuildConfig,
} from '../services/config/guildConfig.js';

import {
    getWelcomeConfig,
} from '../utils/database.js';

import {
    formatWelcomeMessage,
} from '../utils/welcome.js';

import {
    logEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    getServerCounters,
    updateCounter,
} from '../services/serverstatsService.js';

import {
    setBirthday as dbSetBirthday,
} from '../utils/database.js';

import {
    logger,
} from '../utils/logger.js';


/*
|--------------------------------------------------------------------------
| AUTO ROLE
|--------------------------------------------------------------------------
|
| New members will automatically receive this role.
|
*/

const AUTO_ROLE_ID = '1541554587658625104';


/*
|--------------------------------------------------------------------------
| WELCOME CHANNEL
|--------------------------------------------------------------------------
|
| Leave this as null to use the channel configured in the database.
| If you want to hard-code a channel, put its ID here.
|
*/

const WELCOME_CHANNEL_ID = null;


/*
|--------------------------------------------------------------------------
| WELCOME MESSAGE
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
        | GUILD CONFIG
        |--------------------------------------------------------------------------
        */

        let guildConfig;

        try {

            guildConfig = await getGuildConfig(guild.id);

        } catch (error) {

            logger.error(
                `Failed to load guild config for ${guild.id}:`,
                error
            );

            guildConfig = {};
        }


        /*
        |--------------------------------------------------------------------------
        | WELCOME CONFIG
        |--------------------------------------------------------------------------
        */

        let welcomeConfig;

        try {

            welcomeConfig =
                await getWelcomeConfig(guild.id);

        } catch (error) {

            logger.error(
                `Failed to load welcome config for ${guild.id}:`,
                error
            );

            welcomeConfig = {};
        }


        /*
        |--------------------------------------------------------------------------
        | WELCOME FEATURE CHECK
        |--------------------------------------------------------------------------
        */

        const welcomeEnabled =
            botConfig.features?.welcome !== false &&
            guildConfig?.features?.welcome !== false &&
            welcomeConfig?.enabled !== false;


        /*
        |--------------------------------------------------------------------------
        | WELCOME CHANNEL
        |--------------------------------------------------------------------------
        */

        const welcomeChannelId =
            WELCOME_CHANNEL_ID ||
            welcomeConfig?.channelId ||
            botConfig.welcome?.defaultWelcomeChannel;


        if (welcomeEnabled && welcomeChannelId) {

            const welcomeChannel =
                guild.channels.cache.get(welcomeChannelId);


            if (!welcomeChannel) {

                logger.warn(
                    `Welcome channel ${welcomeChannelId} was not found in guild ${guild.id}.`
                );

            } else {

                /*
                |--------------------------------------------------------------------------
                | PERMISSION CHECK
                |--------------------------------------------------------------------------
                */

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
                    | WELCOME EMBED
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
                    | OPTIONAL WELCOME IMAGE
                    |--------------------------------------------------------------------------
                    */

                    const welcomeImage =
                        welcomeConfig?.imageUrl ||
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
                    | SEND WELCOME
                    |--------------------------------------------------------------------------
                    |
                    | The user is pinged in the normal message content.
                    | The actual welcome message is inside the embed.
                    |
                    */

                    try {

                        await welcomeChannel.send({
                            content: user.toString(),

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

                    } catch (error) {

                        logger.error(
                            `Failed to send welcome message for ${user.tag}:`,
                            error
                        );
                    }
                }
            }
        }


        /*
        |--------------------------------------------------------------------------
        | AUTO ROLE
        |--------------------------------------------------------------------------
        |
        | This is now completely code-configured.
        | No /autorole command is required.
        |
        */

        if (AUTO_ROLE_ID) {

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
        }


        /*
        |--------------------------------------------------------------------------
        | VERIFICATION
        |--------------------------------------------------------------------------
        */

        await handleVerification(
            member,
            guildConfig
        );


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


        /*
        |--------------------------------------------------------------------------
        | SERVER COUNTERS
        |--------------------------------------------------------------------------
        */

        try {

            const counters =
                await getServerCounters(
                    guild.id
                );


            if (counters) {

                await updateCounter(
                    guild.id,
                    'members',
                    guild.memberCount
                );
            }

        } catch (error) {

            logger.error(
                `Failed to update server counters for ${guild.id}:`,
                error
            );
        }


        /*
        |--------------------------------------------------------------------------
        | BIRTHDAY RESTORE
        |--------------------------------------------------------------------------
        */

        try {

            if (
                guildConfig?.birthday?.enabled
            ) {

                const birthday =
                    guildConfig.birthday;


                if (
                    birthday.restoreOnJoin &&
                    birthday.savedBirthdays?.[user.id]
                ) {

                    const savedBirthday =
                        birthday.savedBirthdays[user.id];


                    await dbSetBirthday(
                        guild.id,
                        user.id,
                        savedBirthday
                    );
                }
            }

        } catch (error) {

            logger.error(
                `Failed to restore birthday for ${user.tag}:`,
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
        | BOT HIERARCHY CHECK
        |--------------------------------------------------------------------------
        */

        const botMember =
            member.guild.members.me;


        if (!botMember) {

            logger.warn(
                `Could not resolve bot member in ${member.guild.id}.`
            );

            return false;
        }


        if (
            !role.editable
        ) {

            logger.warn(
                `Cannot assign role ${role.name} (${role.id}) because the role is not editable by the bot.`
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


/*
|--------------------------------------------------------------------------
| VERIFICATION
|--------------------------------------------------------------------------
*/

async function handleVerification(
    member,
    guildConfig
) {

    try {

        const verification =
            guildConfig?.verification;


        if (
            !verification ||
            !verification.enabled
        ) {
            return;
        }


        const verificationRoleId =
            verification.roleId;


        if (!verificationRoleId) {
            return;
        }


        const role =
            member.guild.roles.cache.get(
                verificationRoleId
            );


        if (!role) {

            logger.warn(
                `Verification role ${verificationRoleId} was not found in guild ${member.guild.id}.`
            );

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | DO NOT ASSIGN VERIFICATION ROLE IF BOT
        |--------------------------------------------------------------------------
        */

        if (member.user.bot) {
            return;
        }


        /*
        |--------------------------------------------------------------------------
        | ASSIGN VERIFICATION ROLE
        |--------------------------------------------------------------------------
        */

        await assignRoleSafely(
            member,
            role
        );

    } catch (error) {

        logger.error(
            `Verification handling failed for ${member.user.tag}:`,
            error
        );
    }
}
