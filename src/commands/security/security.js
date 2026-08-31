import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js';

import {
    securityConfig,
    isWhitelisted,
} from '../../security/securityConfig.js';

import {
    getSecurityStatus,
    scanGuild,
    enableLockdown,
    disableLockdown,
} from '../../security/securityService.js';

import { securityLog } from '../../security/securityLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('security')
        .setDescription('Manage FruityINC security protection.')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild.toString()
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View the current security status.')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('scan')
                .setDescription('Scan the server for security problems.')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable security protection.')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable security protection.')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('lockdown')
                .setDescription('Lock down server messaging.')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('unlock')
                .setDescription('Remove the security lockdown.')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('whitelist')
                .setDescription('Whitelist a user from security protection.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to whitelist.')
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('unwhitelist')
                .setDescription('Remove a user from the security whitelist.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to remove from the whitelist.')
                        .setRequired(true)
                )
        ),

    category: 'security',

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: '❌ This command can only be used inside a server.',
                ephemeral: true,
            });
        }

        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            return interaction.reply({
                content: '❌ You need **Manage Server** to use this.',
                ephemeral: true,
            });
        }

        const subcommand =
            interaction.options.getSubcommand();

        /*
         * STATUS
         */

        if (subcommand === 'status') {
            const status =
                getSecurityStatus(interaction.guild.id);

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🛡️ FruityINC Security')
                .setDescription(
                    'Current server security configuration.'
                )
                .addFields(
                    {
                        name: '🛡️ Security',
                        value: status.enabled
                            ? '🟢 Enabled'
                            : '🔴 Disabled',
                        inline: true,
                    },
                    {
                        name: '🔗 Discord Invites',
                        value: status.discordInvitesBlocked
                            ? '🟢 Blocked'
                            : '🔴 Allowed',
                        inline: true,
                    },
                    {
                        name: '🚫 Phishing',
                        value: status.phishing
                            ? '🟢 Enabled'
                            : '🔴 Disabled',
                        inline: true,
                    },
                    {
                        name: '💬 Spam',
                        value: status.spam
                            ? '🟢 Enabled'
                            : '🔴 Disabled',
                        inline: true,
                    },
                    {
                        name: '🚨 Anti-Raid',
                        value: status.antiRaid
                            ? '🟢 Enabled'
                            : '🔴 Disabled',
                        inline: true,
                    },
                    {
                        name: '☢️ Anti-Nuke',
                        value: status.antiNuke
                            ? '🟢 Enabled'
                            : '🔴 Disabled',
                        inline: true,
                    },
                    {
                        name: '🚨 Raid Mode',
                        value: status.raidMode
                            ? '🔴 ACTIVE'
                            : '🟢 Inactive',
                        inline: true,
                    },
                    {
                        name: '🔒 Lockdown',
                        value: status.lockdown
                            ? '🔴 ACTIVE'
                            : '🟢 Inactive',
                        inline: true,
                    },
                    {
                        name: '📋 Whitelisted Users',
                        value: `${status.whitelistedUsers}`,
                        inline: true,
                    }
                )
                .setFooter({
                    text: 'Security logs → 1541557303453683792',
                })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });
        }

        /*
         * SCAN
         */

        if (subcommand === 'scan') {
            await interaction.deferReply({
                ephemeral: true,
            });

            await interaction.guild.roles.fetch().catch(() => {});
            await interaction.guild.channels.fetch().catch(() => {});
            await interaction.guild.members.fetch().catch(() => {});

            const result =
                scanGuild(interaction.guild);

            const problemText =
                result.problems.length > 0
                    ? result.problems
                        .map(item => `❌ ${item}`)
                        .join('\n')
                    : 'None detected.';

            const warningText =
                result.warnings.length > 0
                    ? result.warnings
                        .map(item => `⚠️ ${item}`)
                        .join('\n')
                    : 'None detected.';

            const goodText =
                result.good.length > 0
                    ? result.good
                        .slice(0, 15)
                        .map(item => `✅ ${item}`)
                        .join('\n')
                    : 'No checks passed.';

            const embed = new EmbedBuilder()
                .setColor(
                    result.score >= 90
                        ? 0x57F287
                        : result.score >= 70
                            ? 0xFEE75C
                            : 0xED4245
                )
                .setTitle('🔍 Server Security Scan')
                .setDescription(
                    `**Security Score: ${result.score}/100**`
                )
                .addFields(
                    {
                        name: '❌ Problems',
                        value: problemText.slice(0, 1024),
                    },
                    {
                        name: '⚠️ Warnings',
                        value: warningText.slice(0, 1024),
                    },
                    {
                        name: '✅ Passed Checks',
                        value: goodText.slice(0, 1024),
                    }
                )
                .setTimestamp();

            await securityLog(interaction.client, {
                title: 'Server Security Scan',
                description:
                    `${interaction.user} ran a security scan.`,

                color: embed.data.color,

                fields: [
                    {
                        name: 'Security Score',
                        value: `${result.score}/100`,
                    },
                    {
                        name: 'Problems',
                        value: `${result.problems.length}`,
                        inline: true,
                    },
                    {
                        name: 'Warnings',
                        value: `${result.warnings.length}`,
                        inline: true,
                    },
                ],
            });

            return interaction.editReply({
                embeds: [embed],
            });
        }

        /*
         * ENABLE
         */

        if (subcommand === 'enable') {
            securityConfig.enabled = true;

            await securityLog(interaction.client, {
                title: 'Security Enabled',
                description:
                    `${interaction.user} enabled FruityINC security protection.`,
                color: 0x57F287,
            });

            return interaction.reply({
                content:
                    '🛡️ **Security protection enabled.**',
                ephemeral: true,
            });
        }

        /*
         * DISABLE
         */

        if (subcommand === 'disable') {
            securityConfig.enabled = false;

            await securityLog(interaction.client, {
                title: 'Security Disabled',
                description:
                    `${interaction.user} disabled FruityINC security protection.`,
                color: 0xED4245,
            });

            return interaction.reply({
                content:
                    '⚠️ **Security protection disabled.**',
                ephemeral: true,
            });
        }

        /*
         * LOCKDOWN
         */

        if (subcommand === 'lockdown') {
            const changed =
                await enableLockdown(interaction.guild);

            if (!changed) {
                return interaction.reply({
                    content:
                        '⚠️ Security lockdown is already active.',
                    ephemeral: true,
                });
            }

            await securityLog(interaction.client, {
                title: '🔒 SECURITY LOCKDOWN',
                description:
                    `${interaction.user} activated server lockdown.`,
                color: 0xED4245,
            });

            return interaction.reply({
                content:
                    '🔒 **Security lockdown activated.**',
                ephemeral: true,
            });
        }

        /*
         * UNLOCK
         */

        if (subcommand === 'unlock') {
            const changed =
                await disableLockdown(interaction.guild);

            if (!changed) {
                return interaction.reply({
                    content:
                        '⚠️ Security lockdown is not active.',
                    ephemeral: true,
                });
            }

            await securityLog(interaction.client, {
                title: '🔓 SECURITY LOCKDOWN ENDED',
                description:
                    `${interaction.user} removed the server lockdown.`,
                color: 0x57F287,
            });

            return interaction.reply({
                content:
                    '🔓 **Security lockdown removed.**',
                ephemeral: true,
            });
        }

        /*
         * WHITELIST
         */

        if (subcommand === 'whitelist') {
            const user =
                interaction.options.getUser('user', true);

            securityConfig.whitelistedUsers.add(
                user.id
            );

            await securityLog(interaction.client, {
                title: 'Security Whitelist Updated',
                description:
                    `${interaction.user} whitelisted ${user}.`,
                color: 0x57F287,
            });

            return interaction.reply({
                content:
                    `✅ ${user} has been whitelisted from security protection.`,
                ephemeral: true,
            });
        }

        /*
         * UNWHITELIST
         */

        if (subcommand === 'unwhitelist') {
            const user =
                interaction.options.getUser('user', true);

            securityConfig.whitelistedUsers.delete(
                user.id
            );

            await securityLog(interaction.client, {
                title: 'Security Whitelist Updated',
                description:
                    `${interaction.user} removed ${user} from the whitelist.`,
                color: 0xFEE75C,
            });

            return interaction.reply({
                content:
                    `✅ ${user} has been removed from the security whitelist.`,
                ephemeral: true,
            });
        }
    },
};
