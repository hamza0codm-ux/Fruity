// src/tickets/normalTickets.js

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ContainerBuilder,
    EmbedBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
} from 'discord.js';

import {
    getTicketData,
    saveTicketData,
    getOpenTicketCountForUser,
    incrementTicketCounter,
} from '../utils/database.js';

import {
    logger,
} from '../utils/logger.js';

import {
    PRIORITY_MAP,
} from '../utils/helpers.js';


/* ============================================================
   NORMAL TICKET CONFIG
   ============================================================ */

export const NORMAL_TICKET_CONFIG = {
    id: 'normal',

    panelChannelId: '1541551721908801576',

    categoryId: '1542428718826524723',

    staffRoleId: '1541554350797619230',

    ticketLogsChannelId: '1542845775988391937',

    transcriptLogsChannelId: '1542845853310390342',

    reviewLogsChannelId: '1542859014499467285',

    color: 0xF8D568,

    /*
     * Fruity Tickets panel image
     */
    imageUrl:
        'https://media.discordapp.net/attachments/1543682115798044853/1544048276439830708/content.png?ex=6a971684&is=6a95c504&hm=821c388fb27d6dd929e11bfcdd5c5dd1949198bec6adfbcdbd2dbb46c164261d&=&format=webp&quality=lossless&width=768&height=392',

    panelTitle: 'Fruity Tickets',

    panelDescription:
        'Need help with FruityINC? Select the option below that best matches what you need.',

    buttons: [
        {
            id: 'application',
            label: 'Fruity Application',
            emoji: '📋',
            description:
                'Apply to join FruityINC.',
        },

        {
            id: 'faq',
            label: 'General FAQ',
            emoji: '❓',
            description:
                'Ask a general question about FruityINC.',
        },

        {
            id: 'staff_application',
            label: 'Staff Applications',
            emoji: '💼',
            description:
                'Apply for a staff position.',
        },
    ],
};


/* ============================================================
   HELPERS
   ============================================================ */

function getNormalButton(buttonId) {
    return NORMAL_TICKET_CONFIG.buttons.find(
        button => button.id === buttonId
    );
}


function sanitizeChannelName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 90);
}


function getPriorityInfo(priority = 'none') {
    return (
        PRIORITY_MAP?.[priority] ||
        PRIORITY_MAP?.none || {
            label: 'None',
            emoji: '⚪',
            color: 0x95A5A6,
        }
    );
}


function stripPriorityFromName(name) {
    return String(name || '')
        .replace(
            /^(?:⚪|🟢|🟡|🔴|🚨)\s*/u,
            ''
        )
        .trim();
}


function applyPriorityToName(name, priority) {
    const cleanName =
        stripPriorityFromName(name);

    if (
        !priority ||
        priority === 'none'
    ) {
        return cleanName;
    }

    const priorityInfo =
        getPriorityInfo(priority);

    return `${priorityInfo.emoji} ${cleanName}`.slice(
        0,
        100
    );
}


/* ============================================================
   PANEL
   ============================================================ */

export function buildNormalTicketPanel() {
    const container =
        new ContainerBuilder()
            .setAccentColor(
                NORMAL_TICKET_CONFIG.color
            );


    /*
     * HEADER
     */
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🎫 ${NORMAL_TICKET_CONFIG.panelTitle}\n\n` +
            NORMAL_TICKET_CONFIG.panelDescription
        )
    );


    /*
     * FRUITY TICKETS IMAGE
     */
    if (NORMAL_TICKET_CONFIG.imageUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(
                        NORMAL_TICKET_CONFIG.imageUrl
                    )
                    .setDescription(
                        'Fruity Tickets'
                    )
            )
        );
    }


    /*
     * LARGE DIVIDER
     */
    container.addSeparatorComponents(
        new SeparatorBuilder()
            .setSpacing(
                SeparatorSpacingSize.Large
            )
            .setDivider(true)
    );


    /*
     * TICKET OPTIONS
     */
    for (
        const button
        of NORMAL_TICKET_CONFIG.buttons
    ) {
        const section =
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### ${button.emoji} ${button.label}\n` +
                        button.description
                    )
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(
                            `normal_ticket_create:${button.id}`
                        )
                        .setLabel(
                            button.label
                        )
                        .setEmoji(
                            button.emoji
                        )
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                );

        container.addSectionComponents(
            section
        );


        /*
         * LARGE DIVIDER AFTER EACH OPTION
         */
        container.addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(
                    SeparatorSpacingSize.Large
                )
                .setDivider(true)
        );
    }


    /*
     * FOOTER
     */
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            '🎫 Select the button that best matches your request to open a Fruity support ticket.'
        )
    );


    return container;
}


/* ============================================================
   STARTUP PANEL
   ============================================================ */

export async function reconcileNormalTicketPanel(
    client
) {
    try {
        const channel =
            await client.channels.fetch(
                NORMAL_TICKET_CONFIG.panelChannelId
            );

        if (
            !channel ||
            !channel.isTextBased() ||
            !channel.isSendable()
        ) {
            throw new Error(
                `Normal ticket panel channel ${NORMAL_TICKET_CONFIG.panelChannelId} is not sendable.`
            );
        }


        const messages =
            await channel.messages.fetch({
                limit: 50,
            });


        const existing =
            messages.find(message => {
                if (!message.author?.bot) {
                    return false;
                }

                const raw =
                    JSON.stringify(
                        message.components
                    );

                return raw.includes(
                    'normal_ticket_create:'
                );
            });


        const components = [
            buildNormalTicketPanel(),
        ];


        if (existing) {
            await existing.edit({
                components,
                flags:
                    MessageFlags.IsComponentsV2,
            });

            logger.info(
                '[Normal Tickets] Panel updated.'
            );
        } else {
            await channel.send({
                components,
                flags:
                    MessageFlags.IsComponentsV2,
            });

            logger.info(
                '[Normal Tickets] Panel created.'
            );
        }

    } catch (error) {
        logger.error(
            '[Normal Tickets] Failed to reconcile panel:',
            error
        );
    }
}


/* ============================================================
   CREATE TICKET MODAL
   ============================================================ */

export async function showNormalTicketModal(
    interaction,
    buttonId
) {
    const button =
        getNormalButton(buttonId);


    if (!button) {
        await interaction.reply({
            content:
                'This ticket option is no longer available.',
            flags:
                MessageFlags.Ephemeral,
        });

        return;
    }


    const modal =
        new ModalBuilder()
            .setCustomId(
                `normal_ticket_modal:${button.id}`
            )
            .setTitle(
                button.label
            );


    const reason =
        new TextInputBuilder()
            .setCustomId('reason')
            .setLabel(
                'Why are you creating a ticket?'
            )
            .setPlaceholder(
                'Explain what you need help with...'
            )
            .setStyle(
                TextInputStyle.Paragraph
            )
            .setRequired(true)
            .setMaxLength(1000);


    modal.addComponents(
        new ActionRowBuilder()
            .addComponents(
                reason
            )
    );


    await interaction.showModal(
        modal
    );
}


/* ============================================================
   CREATE TICKET
   ============================================================ */

export async function createNormalTicket(
    interaction,
    buttonId,
    reason
) {
    const button =
        getNormalButton(buttonId);


    if (!button) {
        throw new Error(
            'Invalid normal ticket button.'
        );
    }


    const guild =
        interaction.guild;

    const member =
        interaction.member;


    const openCount =
        await getOpenTicketCountForUser(
            guild.id,
            member.id
        );


    if (openCount >= 3) {
        throw new Error(
            'You already have the maximum number of open tickets.'
        );
    }


    const category =
        await guild.channels.fetch(
            NORMAL_TICKET_CONFIG.categoryId
        );


    if (
        !category ||
        category.type !== ChannelType.GuildCategory
    ) {
        throw new Error(
            'The Normal Tickets category could not be found.'
        );
    }


    const ticketNumber =
        await incrementTicketCounter(
            guild.id
        );


    const baseName =
        sanitizeChannelName(
            `${button.label}-${member.user.username}`
        );


    let ticketName =
        baseName;

    let number =
        1;


    while (
        guild.channels.cache.some(
            channel =>
                channel.parentId === category.id &&
                channel.name === ticketName
        )
    ) {
        number++;

        ticketName =
            `${baseName}-${number}`;
    }


    ticketName =
        ticketName.slice(
            0,
            100
        );


    const channel =
        await guild.channels.create({
            name:
                ticketName,

            type:
                ChannelType.GuildText,

            parent:
                category.id,

            permissionOverwrites: [
                {
                    id:
                        guild.id,

                    deny: [
                        PermissionFlagsBits.ViewChannel,
                    ],
                },

                {
                    id:
                        member.id,

                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                    ],
                },

                {
                    id:
                        NORMAL_TICKET_CONFIG.staffRoleId,

                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                    ],
                },
            ],
        });


    const ticketData = {
        id:
            ticketNumber,

        channelId:
            channel.id,

        guildId:
            guild.id,

        userId:
            member.id,

        panelType:
            'normal',

        ticketType:
            button.id,

        ticketName:
            button.label,

        reason,

        status:
            'open',

        priority:
            'none',

        claimedBy:
            null,

        staffRoleId:
            NORMAL_TICKET_CONFIG.staffRoleId,

        categoryId:
            NORMAL_TICKET_CONFIG.categoryId,

        ticketLogsChannelId:
            NORMAL_TICKET_CONFIG.ticketLogsChannelId,

        transcriptLogsChannelId:
            NORMAL_TICKET_CONFIG.transcriptLogsChannelId,

        reviewLogsChannelId:
            NORMAL_TICKET_CONFIG.reviewLogsChannelId,

        createdAt:
            new Date().toISOString(),
    };


    await saveTicketData(
        guild.id,
        channel.id,
        ticketData
    );


    const priority =
        getPriorityInfo('none');


    const embed =
        new EmbedBuilder()
            .setColor(
                NORMAL_TICKET_CONFIG.color
            )
            .setTitle(
                `${button.emoji} ${button.label}`
            )
            .setDescription(
                `${member}, thank you for opening a ticket.\n\n` +
                `**Ticket Type:** ${button.label}\n` +
                `**Reason:** ${reason}\n` +
                `**Priority:** ${priority.emoji} ${priority.label}`
            )
            .addFields(
                {
                    name:
                        'Status',

                    value:
                        '🟢 Open',

                    inline:
                        true,
                },

                {
                    name:
                        'Claimed By',

                    value:
                        'Not claimed',

                    inline:
                        true,
                },

                {
                    name:
                        '\u200b',

                    value:
                        '────────────────────────',

                    inline:
                        false,
                },

                {
                    name:
                        '\u200b',

                    value:
                        'The Fruity Support Team will help you soon.\n' +
                        'Please provide your details now so we can assist you faster.\n' +
                        'Please do not ping owners or staff members too much.',

                    inline:
                        false,
                }
            )
            .setTimestamp();


    /*
     * TICKET CONTROLS
     */
    const controls =
        new ActionRowBuilder()
            .addComponents(

                /*
                 * CLAIM
                 */
                new ButtonBuilder()
                    .setCustomId(
                        'ticket_claim'
                    )
                    .setLabel(
                        'Claim'
                    )
                    .setEmoji(
                        '🙋'
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    ),


                /*
                 * PRIORITY
                 */
                new ButtonBuilder()
                    .setCustomId(
                        'ticket_priority'
                    )
                    .setLabel(
                        'Priority'
                    )
                    .setEmoji(
                        '🎯'
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    ),


                /*
                 * CLOSE
                 */
                new ButtonBuilder()
                    .setCustomId(
                        'ticket_close'
                    )
                    .setLabel(
                        'Close'
                    )
                    .setEmoji(
                        '🔒'
                    )
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );


    await channel.send({
        content:
            member.toString(),

        embeds:
            [
                embed
            ],

        components:
            [
                controls
            ],

        allowedMentions: {
            users:
                [
                    member.id
                ],

            roles:
                [],
        },
    });


    return {
        channel,
        ticketData,
    };
}


/* ============================================================
   NORMAL TICKET BUTTON HANDLER
   ============================================================ */

export const normalTicketCreateButton = {
    name:
        'normal_ticket_create',

    async execute(
        interaction,
        client,
        args
    ) {
        const buttonId =
            args[0];


        await showNormalTicketModal(
            interaction,
            buttonId
        );
    },
};


/* ============================================================
   NORMAL TICKET MODAL HANDLER
   ============================================================ */

export const normalTicketModal = {
    name:
        'normal_ticket_modal',

    async execute(
        interaction
    ) {
        const buttonId =
            interaction.customId.split(':')[1];


        const reason =
            interaction.fields
                .getTextInputValue(
                    'reason'
                )
                .trim();


        if (!reason) {
            await interaction.reply({
                content:
                    'Please explain why you are creating this ticket.',
                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }


        await interaction.deferReply({
            flags:
                MessageFlags.Ephemeral,
        });


        try {
            const result =
                await createNormalTicket(
                    interaction,
                    buttonId,
                    reason
                );


            await interaction.editReply({
                content:
                    `✅ Your ticket has been created: ${result.channel}`,
            });

        } catch (error) {
            logger.error(
                '[Normal Tickets] Ticket creation failed:',
                error
            );


            await interaction.editReply({
                content:
                    `❌ ${error.message || 'Failed to create your ticket.'}`,
            });
        }
    },
};


/* ============================================================
   EXPORT CONFIG
   ============================================================ */

export default {
    config:
        NORMAL_TICKET_CONFIG,

    buildPanel:
        buildNormalTicketPanel,

    reconcile:
        reconcileNormalTicketPanel,

    create:
        createNormalTicket,
};
