// src/tickets/merchTickets.js

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
   MERCH TICKET CONFIG
   ============================================================ */

export const MERCH_TICKET_CONFIG = {
    id: 'merch',

    panelChannelId: '1543031129559408660',

    categoryId: '1543352648021966949',

    staffRoleId: '1543556139462164480',

    ticketLogsChannelId: '1543331796568121467',

    transcriptLogsChannelId: '1543331916235931678',

    reviewLogsChannelId: '1543332129117708380',

    color: 0xF8D568,

    /*
     * Optional merch panel image.
     *
     * Leave null if you do not want an image.
     */
    imageUrl: null,

    panelTitle: 'Merch Tickets',

    panelDescription:
        'Need help with Fruity merchandise? Select the option below that best matches your request.',

    buttons: [
        {
            id: 'returns',
            label: 'Returns',
            emoji: '⛔',
            description:
                'Need help with returning an item?',
        },

        {
            id: 'inquire',
            label: 'Inquire',
            emoji: '❓',
            description:
                'Have a question about our merchandise?',
        },

        {
            id: 'shipping',
            label: 'Shipping Help',
            emoji: '📦',
            description:
                'Need help with shipping or delivery?',
        },
    ],
};


/* ============================================================
   HELPERS
   ============================================================ */

function getMerchButton(buttonId) {
    return MERCH_TICKET_CONFIG.buttons.find(
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
            /^(?:⚪|🟢|🟡|🟠|🔴|🚨)\s*/u,
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
   MERCH TICKET PANEL
   ============================================================ */

export function buildMerchTicketPanel() {
    const container =
        new ContainerBuilder()
            .setAccentColor(
                MERCH_TICKET_CONFIG.color
            );


    /*
     * HEADER
     */
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🛍️ ${MERCH_TICKET_CONFIG.panelTitle}\n\n` +
            MERCH_TICKET_CONFIG.panelDescription
        )
    );


    /*
     * OPTIONAL IMAGE
     */
    if (MERCH_TICKET_CONFIG.imageUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(
                        MERCH_TICKET_CONFIG.imageUrl
                    )
                    .setDescription(
                        'Fruity Merchandise Tickets'
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
        of MERCH_TICKET_CONFIG.buttons
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
                            `merch_ticket_create:${button.id}`
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
            '🛍️ Select the button that best matches your request to open a merchandise support ticket.'
        )
    );


    return container;
}


/* ============================================================
   STARTUP PANEL
   ============================================================ */

export async function reconcileMerchTicketPanel(
    client
) {
    try {
        const channel =
            await client.channels.fetch(
                MERCH_TICKET_CONFIG.panelChannelId
            );


        if (
            !channel ||
            !channel.isTextBased() ||
            !channel.isSendable()
        ) {
            throw new Error(
                `Merch ticket panel channel ${MERCH_TICKET_CONFIG.panelChannelId} is not sendable.`
            );
        }


        const messages =
            await channel.messages.fetch({
                limit: 50,
            });


        /*
         * Find the existing merch panel.
         */
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
                    'merch_ticket_create:'
                );
            });


        const components = [
            buildMerchTicketPanel(),
        ];


        /*
         * UPDATE EXISTING PANEL
         */
        if (existing) {
            await existing.edit({
                components,
                flags:
                    MessageFlags.IsComponentsV2,
            });


            logger.info(
                '[Merch Tickets] Panel updated.'
            );
        }


        /*
         * CREATE PANEL IF IT DOES NOT EXIST
         */
        else {
            await channel.send({
                components,
                flags:
                    MessageFlags.IsComponentsV2,
            });


            logger.info(
                '[Merch Tickets] Panel created.'
            );
        }


    } catch (error) {
        logger.error(
            '[Merch Tickets] Failed to reconcile panel:',
            error
        );
    }
}


/* ============================================================
   CREATE TICKET MODAL
   ============================================================ */

export async function showMerchTicketModal(
    interaction,
    buttonId
) {
    const button =
        getMerchButton(buttonId);


    if (!button) {
        await interaction.reply({
            content:
                'This merchandise ticket option is no longer available.',

            flags:
                MessageFlags.Ephemeral,
        });


        return;
    }


    const modal =
        new ModalBuilder()
            .setCustomId(
                `merch_ticket_modal:${button.id}`
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
                'Tell us what you need help with...'
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
   CREATE MERCH TICKET
   ============================================================ */

export async function createMerchTicket(
    interaction,
    buttonId,
    reason
) {
    const button =
        getMerchButton(buttonId);


    if (!button) {
        throw new Error(
            'Invalid merchandise ticket button.'
        );
    }


    const guild =
        interaction.guild;

    const member =
        interaction.member;


    /*
     * MAXIMUM OPEN TICKETS
     */
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


    /*
     * GET MERCH CATEGORY
     */
    const category =
        await guild.channels.fetch(
            MERCH_TICKET_CONFIG.categoryId
        );


    if (
        !category ||
        category.type !== ChannelType.GuildCategory
    ) {
        throw new Error(
            'The Merch Tickets category could not be found.'
        );
    }


    /*
     * INTERNAL TICKET NUMBER
     *
     * This stays in the database/logs,
     * but is NOT displayed in the ticket message.
     */
    const ticketNumber =
        await incrementTicketCounter(
            guild.id
        );


    /*
     * CHANNEL NAME
     */
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


    /*
     * CREATE CHANNEL
     */
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
                        MERCH_TICKET_CONFIG.staffRoleId,

                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                    ],
                },
            ],
        });


    /*
     * SAVE TICKET DATA
     */
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
            'merch',

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
            MERCH_TICKET_CONFIG.staffRoleId,

        categoryId:
            MERCH_TICKET_CONFIG.categoryId,

        ticketLogsChannelId:
            MERCH_TICKET_CONFIG.ticketLogsChannelId,

        transcriptLogsChannelId:
            MERCH_TICKET_CONFIG.transcriptLogsChannelId,

        reviewLogsChannelId:
            MERCH_TICKET_CONFIG.reviewLogsChannelId,

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


    /*
     * ORIGINAL TICKET MESSAGE
     */
    const embed =
        new EmbedBuilder()
            .setColor(
                MERCH_TICKET_CONFIG.color
            )
            .setTitle(
                `${button.emoji} ${button.label}`
            )
            .setDescription(
                `${member}, thank you for opening a merchandise ticket.\n\n` +
                `**Request:** ${button.label}\n` +
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
                        'The Fruity Support Team will assist you shortly,\n' +
                        'In the meantime please provide your request and information to speed up the process,\n' +
                        'We ask you to not ping our staff whilst this ticket is open.',

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


    /*
     * SEND ONLY ONE OPENING MESSAGE
     */
    const ticketMessage =
        await channel.send({
            content:
                member.toString(),

            embeds: [
                embed,
            ],

            components: [
                controls,
            ],

            allowedMentions: {
                users: [
                    member.id,
                ],

                roles: [],
            },
        });


    /*
     * SAVE THE ORIGINAL MESSAGE ID
     *
     * Claim/Priority can use this exact message
     * instead of trying to find it by its title.
     */
    await saveTicketData(
        guild.id,
        channel.id,
        {
            ...ticketData,

            mainMessageId:
                ticketMessage.id,
        }
    );


    return {
        channel,

        ticketData: {
            ...ticketData,

            mainMessageId:
                ticketMessage.id,
        },

        message:
            ticketMessage,
    };
}


/* ============================================================
   MERCH TICKET BUTTON HANDLER
   ============================================================ */

export const merchTicketCreateButton = {
    name:
        'merch_ticket_create',

    async execute(
        interaction,
        client,
        args
    ) {
        const buttonId =
            args[0];


        await showMerchTicketModal(
            interaction,
            buttonId
        );
    },
};


/* ============================================================
   MERCH TICKET MODAL HANDLER
   ============================================================ */

export const merchTicketModal = {
    name:
        'merch_ticket_modal',

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
                await createMerchTicket(
                    interaction,
                    buttonId,
                    reason
                );


            await interaction.editReply({
                content:
                    `✅ Your merchandise ticket has been created: ${result.channel}`,
            });


        } catch (error) {
            logger.error(
                '[Merch Tickets] Ticket creation failed:',
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
        MERCH_TICKET_CONFIG,

    buildPanel:
        buildMerchTicketPanel,

    reconcile:
        reconcileMerchTicketPanel,

    create:
        createMerchTicket,
};
