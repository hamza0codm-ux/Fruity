import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    ChannelType,
    EmbedBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    LabelBuilder,
    RadioGroupBuilder,
} from 'discord.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import {
    TitanBotError,
    replyUserError,
    ErrorTypes,
} from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 900_000;

const COLOR_PRESETS = [
    { label: 'Primary (Blue)', value: '#336699' },
    { label: 'Success (Green)', value: '#57F287' },
    { label: 'Error (Red)', value: '#ED4245' },
    { label: 'Warning (Yellow)', value: '#FEE75C' },
    { label: 'Info (Bright Blue)', value: '#3498DB' },
    { label: 'Blurple (Discord)', value: '#5865F2' },
    { label: 'Fuchsia', value: '#EB459E' },
    { label: 'Gold', value: '#F1C40F' },
    { label: 'White', value: '#FFFFFF' },
    { label: 'Dark', value: '#202225' },
    { label: 'Custom Hex...', value: '__custom__' },
];

function isValidUrl(str) {
    try {
        const url = new URL(str);

        return (
            url.protocol === 'http:' ||
            url.protocol === 'https:'
        );
    } catch {
        return false;
    }
}

function isValidHex(str) {
    return /^#[0-9A-Fa-f]{6}$/.test(str);
}

function resolveEmbedColor(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && isValidHex(value)) {
        return parseInt(value.slice(1), 16);
    }

    try {
        const resolved = getColor(value || 'primary');

        if (
            typeof resolved === 'number' &&
            Number.isFinite(resolved) &&
            resolved >= 0 &&
            resolved <= 0xffffff
        ) {
            return resolved;
        }
    } catch {
        // Ignore invalid colors.
    }

    return getColor('primary');
}

function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title) {
        embed.setTitle(state.title.substring(0, 256));
    }

    if (state.description) {
        embed.setDescription(state.description.substring(0, 4096));
    }

    embed.setColor(resolveEmbedColor(state.color));

    if (state.url && isValidUrl(state.url)) {
        embed.setURL(state.url);
    }

    if (state.author?.name) {
        const author = {
            name: state.author.name.substring(0, 256),
        };

        if (
            state.author.iconUrl &&
            isValidUrl(state.author.iconUrl)
        ) {
            author.iconURL = state.author.iconUrl;
        }

        if (
            state.author.url &&
            isValidUrl(state.author.url)
        ) {
            author.url = state.author.url;
        }

        embed.setAuthor(author);
    }

    if (state.footer?.text) {
        const footer = {
            text: state.footer.text.substring(0, 2048),
        };

        if (
            state.footer.iconUrl &&
            isValidUrl(state.footer.iconUrl)
        ) {
            footer.iconURL = state.footer.iconUrl;
        }

        embed.setFooter(footer);
    }

    if (
        state.thumbnail &&
        isValidUrl(state.thumbnail)
    ) {
        embed.setThumbnail(state.thumbnail);
    }

    if (
        state.image &&
        isValidUrl(state.image)
    ) {
        embed.setImage(state.image);
    }

    if (state.timestamp) {
        embed.setTimestamp();
    }

    if (state.fields.length > 0) {
        embed.addFields(
            state.fields
                .slice(0, MAX_FIELDS)
                .map(field => ({
                    name: field.name.substring(0, 256),
                    value: field.value.substring(0, 1024),
                    inline: Boolean(field.inline),
                })),
        );
    }

    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        embed.setDescription(
            '*(Empty — use the menu below to add content)*',
        );
    }

    return embed;
}

/*
 * Discord Components V2 does not support embeds.
 *
 * Therefore the V2 version is built from native V2 components:
 *
 * Container
 * ├── TextDisplay
 * ├── Separator
 * ├── TextDisplay
 * ├── Fields
 * ├── Media Gallery
 * └── Sections
 */
function buildV2Message(state) {
    const container = new ContainerBuilder();

    const title = state.title
        ? `# ${state.title.substring(0, 256)}`
        : null;

    const description = state.description
        ? state.description.substring(0, 4000)
        : null;

    if (title) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(title),
        );
    }

    if (description) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(description),
        );
    }

    if (title || description) {
        container.addSeparatorComponents(
            new SeparatorBuilder(),
        );
    }

    if (state.author?.name) {
        let authorText = `**${state.author.name.substring(0, 256)}**`;

        if (state.author.url && isValidUrl(state.author.url)) {
            authorText += ` — [Profile](${state.author.url})`;
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(authorText),
        );
    }

    if (state.fields.length > 0) {
        for (const field of state.fields.slice(0, MAX_FIELDS)) {
            const fieldText =
                `**${field.name.substring(0, 256)}**\n` +
                field.value.substring(0, 1024);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(fieldText),
            );
        }
    }

    if (state.footer?.text) {
        container.addSeparatorComponents(
            new SeparatorBuilder(),
        );

        let footerText =
            `-# ${state.footer.text.substring(0, 2048)}`;

        if (
            state.footer.iconUrl &&
            isValidUrl(state.footer.iconUrl)
        ) {
            footerText =
                `-# ${state.footer.text.substring(0, 2048)}\n` +
                `[Footer Icon](${state.footer.iconUrl})`;
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footerText),
        );
    }

    if (state.timestamp) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '-# Timestamp enabled',
            ),
        );
    }

    /*
     * V2 Media Gallery.
     *
     * Large image becomes a native V2 media gallery.
     */
    if (state.image && isValidUrl(state.image)) {
        container.addSeparatorComponents(
            new SeparatorBuilder(),
        );

        const gallery = new MediaGalleryBuilder()
            .addItems(
                new MediaGalleryItemBuilder()
                    .setURL(state.image),
            );

        container.addMediaGalleryComponents(gallery);
    }

    /*
     * V2 thumbnail/accessory.
     *
     * A SectionBuilder can display text alongside a thumbnail.
     */
    if (
        state.thumbnail &&
        isValidUrl(state.thumbnail)
    ) {
        const section = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '### 🖼️ Image\nThumbnail attached.',
                ),
            );

        /*
         * Discord V2 sections can use a thumbnail
         * as the accessory through the media component.
         */
        try {
            section.setThumbnailAccessory({
                media: {
                    url: state.thumbnail,
                },
            });

            container.addSectionComponents(section);
        } catch {
            /*
             * If the installed discord.js version doesn't expose
             * setThumbnailAccessory(), simply leave the thumbnail
             * out of the V2 message rather than crashing.
             */
        }
    }

    /*
     * If absolutely nothing has been entered.
     */
    if (
        !state.title &&
        !state.description &&
        !state.author?.name &&
        state.fields.length === 0 &&
        !state.image &&
        !state.thumbnail &&
        !state.footer?.text
    ) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '*Empty V2 message — add some content using the builder.*',
            ),
        );
    }

    return container;
}

function buildDashboardEmbed(state) {
    const trunc = (str, length) =>
        str.length > length
            ? `${str.substring(0, length)}…`
            : str;

    const lines = [
        `**Mode** › \`${state.mode === 'v2' ? 'Components V2' : 'Classic V1 Embed'}\``,
        `**Title** › ${state.title ? `\`${trunc(state.title, 40)}\`` : '`Not set`'}`,
        `**Description** › ${state.description ? `${state.description.length} character(s)` : '`Not set`'}`,
        `**Color** › \`${typeof state.color === 'number' ? `#${state.color.toString(16).padStart(6, '0')}` : state.color}\``,
        `**Author** › ${state.author?.name ? `\`${trunc(state.author.name, 30)}\`` : '`Not set`'}`,
        `**Footer** › ${state.footer?.text ? `\`${trunc(state.footer.text, 30)}\`` : '`Not set`'}`,
        `**Thumbnail** › ${state.thumbnail ? '✅ Set' : '`Not set`'}`,
        `**Image** › ${state.image ? '✅ Set' : '`Not set`'}`,
        `**Timestamp** › ${state.timestamp ? '✅ Enabled' : '`Disabled`'}`,
        `**Fields** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('🍊 Fruity Embed Builder')
        .setDescription(lines.join('\n'))
        .setColor(getColor('info'))
        .setFooter({
            text: 'Use the buttons below to build your message.',
        });
}

function buildMainMenu(state) {
    const modeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_mode_v1')
            .setLabel('V1 Classic')
            .setStyle(
                state.mode === 'v1'
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary,
            )
            .setEmoji('📦'),

        new ButtonBuilder()
            .setCustomId('eb_main_mode_v2')
            .setLabel('V2 Components')
            .setStyle(
                state.mode === 'v2'
                    ? ButtonStyle.Primary
                    : ButtonStyle.Secondary,
            )
            .setEmoji('🧩'),
    );

    const primaryRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_edit_content')
            .setLabel('Edit Content')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),

        new ButtonBuilder()
            .setCustomId('eb_main_set_color')
            .setLabel('Set Color')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎨'),

        new ButtonBuilder()
            .setCustomId('eb_main_set_images')
            .setLabel('Set Images')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🖼️'),

        new ButtonBuilder()
            .setCustomId('eb_main_post_embed')
            .setLabel('Post')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤'),
    );

    const secondRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_set_author')
            .setLabel('Author')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👤'),

        new ButtonBuilder()
            .setCustomId('eb_main_set_footer')
            .setLabel('Footer')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔻'),

        new ButtonBuilder()
            .setCustomId('eb_main_add_field')
            .setLabel(`Add Field (${state.fields.length}/${MAX_FIELDS})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕'),

        new ButtonBuilder()
            .setCustomId('eb_main_edit_field')
            .setLabel('Edit Field')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
            .setDisabled(state.fields.length === 0),
    );

    const thirdRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_remove_field')
            .setLabel('Remove Field')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('➖')
            .setDisabled(state.fields.length === 0),

        new ButtonBuilder()
            .setCustomId('eb_main_reorder_fields')
            .setLabel('Reorder')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('↕️')
            .setDisabled(state.fields.length < 2),

        new ButtonBuilder()
            .setCustomId('eb_main_toggle_timestamp')
            .setLabel(
                state.timestamp
                    ? 'Disable Timestamp'
                    : 'Enable Timestamp',
            )
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕐'),

        new ButtonBuilder()
            .setCustomId('eb_main_json_export')
            .setLabel('JSON')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
    );

    const fourthRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_reset_all')
            .setLabel('Reset Everything')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    return [
        modeRow,
        primaryRow,
        secondRow,
        thirdRow,
        fourthRow,
    ];
}

async function refreshDashboard(
    interaction,
    state,
) {
    const previewEmbed = buildPreviewEmbed(state);

    if (
        previewEmbed.data.description ===
        '*(Empty — use the menu below to add content)*'
    ) {
        previewEmbed.setDescription(null);
    }

    return InteractionHelper.safeEditReply(
        interaction,
        {
            embeds: [
                previewEmbed,
                buildDashboardEmbed(state),
            ],
            components: buildMainMenu(state),
        },
    );
}

async function handleEditContent(
    interaction,
    rootInteraction,
    state,
) {
    const modal = new ModalBuilder()
        .setCustomId('eb_content')
        .setTitle('Edit Content')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_title')
                    .setLabel('Title')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.title || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('My Embed Title'),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_description')
                    .setLabel('Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(
                        state.description
                            ? state.description.substring(0, 4000)
                            : '',
                    )
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder(
                        'Write your message here...',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_url')
                    .setLabel('Message URL (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.url || '')
                    .setRequired(false)
                    .setPlaceholder(
                        'https://example.com',
                    ),
            ),
        );

    const shown =
        await InteractionHelper.safeShowModal(
            interaction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await interaction.awaitModalSubmit({
            filter: i =>
                i.customId === 'eb_content' &&
                i.user.id === interaction.user.id,
            time: 120_000,
        }).catch(() => null);

    if (!submitted) return;

    const title =
        submitted.fields
            .getTextInputValue('eb_title')
            .trim();

    const description =
        submitted.fields
            .getTextInputValue('eb_description')
            .trim();

    const url =
        submitted.fields
            .getTextInputValue('eb_url')
            .trim();

    if (url && !isValidUrl(url)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message:
                'The URL must be a valid `https://` or `http://` URL.',
        });
        return;
    }

    state.title = title || null;
    state.description = description || null;
    state.url = url || null;

    await submitted.deferUpdate().catch(() => {});

    await refreshDashboard(
        rootInteraction,
        state,
    );
}

async function handleSetColor(
    interaction,
    rootInteraction,
    state,
) {
    await interaction.deferUpdate().catch(() => {});

    const colorSelect =
        new StringSelectMenuBuilder()
            .setCustomId('eb_color_pick')
            .setPlaceholder('Choose a color...')
            .addOptions(
                COLOR_PRESETS.map(color =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(color.label)
                        .setValue(color.value)
                        .setDescription(
                            color.value === '__custom__'
                                ? 'Enter your own #RRGGBB color'
                                : color.value,
                        ),
                ),
            );

    await interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎨 Set Color')
                .setDescription(
                    'Choose a preset or enter a custom hex color.',
                )
                .setColor(getColor('info')),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                colorSelect,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === 'eb_color_pick',
            time: 60_000,
            max: 1,
        });

    collector.on('collect', async selected => {
        try {
            const value = selected.values[0];

            if (value === '__custom__') {
                const modal = new ModalBuilder()
                    .setCustomId('eb_custom_hex')
                    .setTitle('Custom Color')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('hex_value')
                                .setLabel('Hex Color')
                                .setStyle(
                                    TextInputStyle.Short,
                                )
                                .setPlaceholder('#F8D568')
                                .setMinLength(7)
                                .setMaxLength(7)
                                .setRequired(true),
                        ),
                    );

                const shown =
                    await InteractionHelper.safeShowModal(
                        selected,
                        modal,
                    );

                if (!shown) return;

                const submit =
                    await selected.awaitModalSubmit({
                        filter: i =>
                            i.customId === 'eb_custom_hex' &&
                            i.user.id === selected.user.id,
                        time: 60_000,
                    }).catch(() => null);

                if (!submit) return;

                const hex =
                    submit.fields
                        .getTextInputValue('hex_value')
                        .trim();

                if (!isValidHex(hex)) {
                    await replyUserError(submit, {
                        type: ErrorTypes.USER_INPUT,
                        message:
                            'Invalid hex color. Example: `#F8D568`.',
                    });
                    return;
                }

                state.color = hex;

                await submit.deferUpdate().catch(
                    () => {},
                );
            } else {
                state.color = value;

                await selected.deferUpdate().catch(
                    () => {},
                );
            }

            await refreshDashboard(
                rootInteraction,
                state,
            );
        } catch (error) {
            logger.warn(
                'Embed builder color interaction failed:',
                error,
            );
        }
    });
}

async function handleSetAuthor(
    interaction,
    rootInteraction,
    state,
) {
    const modal = new ModalBuilder()
        .setCustomId('eb_author')
        .setTitle('Set Author')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('Author Name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(
                        state.author?.name || '',
                    )
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder(
                        'Leave blank to remove',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('Author Icon URL')
                    .setStyle(TextInputStyle.Short)
                    .setValue(
                        state.author?.iconUrl || '',
                    )
                    .setRequired(false)
                    .setPlaceholder(
                        'https://example.com/icon.png',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('Author Link URL')
                    .setStyle(TextInputStyle.Short)
                    .setValue(
                        state.author?.url || '',
                    )
                    .setRequired(false)
                    .setPlaceholder(
                        'https://example.com',
                    ),
            ),
        );

    const shown =
        await InteractionHelper.safeShowModal(
            interaction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await interaction.awaitModalSubmit({
            filter: i =>
                i.customId === 'eb_author' &&
                i.user.id === interaction.user.id,
            time: 120_000,
        }).catch(() => null);

    if (!submitted) return;

    const name =
        submitted.fields
            .getTextInputValue('author_name')
            .trim();

    const iconUrl =
        submitted.fields
            .getTextInputValue('author_icon')
            .trim();

    const url =
        submitted.fields
            .getTextInputValue('author_url')
            .trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message:
                'Author icon must be a valid URL.',
        });
        return;
    }

    if (url && !isValidUrl(url)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message:
                'Author URL must be a valid URL.',
        });
        return;
    }

    state.author = name
        ? {
            name,
            iconUrl: iconUrl || null,
            url: url || null,
        }
        : null;

    await submitted.deferUpdate().catch(() => {});

    await refreshDashboard(
        rootInteraction,
        state,
    );
}

async function handleSetFooter(
    interaction,
    rootInteraction,
    state,
) {
    const modal = new ModalBuilder()
        .setCustomId('eb_footer')
        .setTitle('Set Footer')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('Footer Text')
                    .setStyle(TextInputStyle.Short)
                    .setValue(
                        state.footer?.text || '',
                    )
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder(
                        'Leave blank to remove',
                    ),
            ),

            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('Footer Icon URL')
                    .setStyle(TextInputStyle.Short)
                    .setValue(
                        state.footer?.iconUrl || '',
                    )
                    .setRequired(false)
                    .setPlaceholder(
                        'https://example.com/icon.png',
                    ),
            ),
        );

    const shown =
        await InteractionHelper.safeShowModal(
            interaction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await interaction.awaitModalSubmit({
            filter: i =>
                i.customId === 'eb_footer' &&
                i.user.id === interaction.user.id,
            time: 120_000,
        }).catch(() => null);

    if (!submitted) return;

    const text =
        submitted.fields
            .getTextInputValue('footer_text')
            .trim();

    const iconUrl =
        submitted.fields
            .getTextInputValue('footer_icon')
            .trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message:
                'Footer icon must be a valid URL.',
        });
        return;
    }

    state.footer = text
        ? {
            text,
            iconUrl: iconUrl || null,
        }
        : null;

    await submitted.deferUpdate().catch(() => {});

    await refreshDashboard(
        rootInteraction,
        state,
    );
}

async function handleSetImages(
    interaction,
    rootInteraction,
    state,
) {
    await interaction.deferUpdate().catch(() => {});

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId('eb_image_pick')
            .setPlaceholder(
                'Choose an image option...',
            )
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Set Thumbnail')
                    .setValue('thumbnail')
                    .setEmoji('🖼️'),

                new StringSelectMenuOptionBuilder()
                    .setLabel('Set Large Image')
                    .setValue('image')
                    .setEmoji('📸'),

                new StringSelectMenuOptionBuilder()
                    .setLabel('Clear Thumbnail')
                    .setValue('clear_thumbnail')
                    .setEmoji('🗑️'),

                new StringSelectMenuOptionBuilder()
                    .setLabel('Clear Large Image')
                    .setValue('clear_image')
                    .setEmoji('🗑️'),
            );

    await interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🖼️ Set Images')
                .setDescription(
                    'Choose which image you want to modify.',
                )
                .setColor(getColor('info')),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                menu,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === 'eb_image_pick',
            time: 60_000,
            max: 1,
        });

    collector.on('collect', async selected => {
        try {
            const choice = selected.values[0];

            if (choice === 'clear_thumbnail') {
                state.thumbnail = null;

                await selected.deferUpdate();

                await refreshDashboard(
                    rootInteraction,
                    state,
                );

                return;
            }

            if (choice === 'clear_image') {
                state.image = null;

                await selected.deferUpdate();

                await refreshDashboard(
                    rootInteraction,
                    state,
                );

                return;
            }

            const isThumbnail =
                choice === 'thumbnail';

            const modal = new ModalBuilder()
                .setCustomId('eb_image_url')
                .setTitle(
                    isThumbnail
                        ? 'Set Thumbnail'
                        : 'Set Large Image',
                )
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('image_url')
                            .setLabel('Image URL')
                            .setStyle(
                                TextInputStyle.Short,
                            )
                            .setValue(
                                isThumbnail
                                    ? state.thumbnail || ''
                                    : state.image || '',
                            )
                            .setRequired(true)
                            .setPlaceholder(
                                'https://example.com/image.png',
                            ),
                    ),
                );

            const shown =
                await InteractionHelper.safeShowModal(
                    selected,
                    modal,
                );

            if (!shown) return;

            const submitted =
                await selected.awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_image_url' &&
                        i.user.id === selected.user.id,
                    time: 60_000,
                }).catch(() => null);

            if (!submitted) return;

            const url =
                submitted.fields
                    .getTextInputValue('image_url')
                    .trim();

            if (!isValidUrl(url)) {
                await replyUserError(submitted, {
                    type: ErrorTypes.USER_INPUT,
                    message:
                        'Image URL must be a valid URL.',
                });
                return;
            }

            if (isThumbnail) {
                state.thumbnail = url;
            } else {
                state.image = url;
            }

            await submitted.deferUpdate().catch(
                () => {},
            );

            await refreshDashboard(
                rootInteraction,
                state,
            );
        } catch (error) {
            logger.warn(
                'Embed builder image interaction failed:',
                error,
            );
        }
    });
}

async function handleAddField(
    interaction,
    rootInteraction,
    state,
) {
    if (state.fields.length >= MAX_FIELDS) {
        await interaction.deferUpdate().catch(
            () => {},
        );

        await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message:
                `You can only have ${MAX_FIELDS} fields.`,
        });

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field')
        .setTitle('Add Field');

    const nameLabel =
        new LabelBuilder()
            .setLabel('Field Name')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_name')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(256)
                    .setRequired(true)
                    .setPlaceholder(
                        'Field title',
                    ),
            );

    const valueLabel =
        new LabelBuilder()
            .setLabel('Field Value')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_value')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1024)
                    .setRequired(true)
                    .setPlaceholder(
                        'Field content',
                    ),
            );

    const inlineRadio =
        new RadioGroupBuilder()
            .setCustomId('field_inline')
            .setRequired(false)
            .addOptions([
                {
                    label: 'No — full width',
                    value: 'no',
                },
                {
                    label: 'Yes — side-by-side',
                    value: 'yes',
                },
            ]);

    const inlineLabel =
        new LabelBuilder()
            .setLabel('Display inline?')
            .setRadioGroupComponent(
                inlineRadio,
            );

    modal.addLabelComponents(
        nameLabel,
        valueLabel,
        inlineLabel,
    );

    const shown =
        await InteractionHelper.safeShowModal(
            interaction,
            modal,
        );

    if (!shown) return;

    const submitted =
        await interaction.awaitModalSubmit({
            filter: i =>
                i.customId === 'eb_add_field' &&
                i.user.id === interaction.user.id,
            time: 120_000,
        }).catch(() => null);

    if (!submitted) return;

    const name =
        submitted.fields
            .getTextInputValue('field_name')
            .trim();

    const value =
        submitted.fields
            .getTextInputValue('field_value')
            .trim();

    const inline =
        submitted.fields.getRadioGroup(
            'field_inline',
        ) === 'yes';

    state.fields.push({
        name,
        value,
        inline,
    });

    await submitted.deferUpdate().catch(() => {});

    await refreshDashboard(
        rootInteraction,
        state,
    );
}

async function handleEditField(
    interaction,
    rootInteraction,
    state,
) {
    await interaction.deferUpdate();

    const select =
        new StringSelectMenuBuilder()
            .setCustomId('eb_edit_field_pick')
            .setPlaceholder(
                'Select a field...',
            )
            .addOptions(
                state.fields
                    .slice(0, 25)
                    .map((field, index) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                `${index + 1}. ${field.name.substring(0, 90)}`,
                            )
                            .setValue(
                                String(index),
                            )
                            .setEmoji('📝'),
                    ),
            );

    await interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📝 Edit Field')
                .setDescription(
                    'Select the field you want to edit.',
                )
                .setColor(getColor('info')),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                select,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === 'eb_edit_field_pick',
            time: 60_000,
            max: 1,
        });

    collector.on('collect', async selected => {
        const index =
            Number.parseInt(
                selected.values[0],
                10,
            );

        const field = state.fields[index];

        if (!field) {
            await selected.deferUpdate();
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('eb_edit_field_modal')
            .setTitle(
                `Edit Field ${index + 1}`,
            )
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('field_name')
                        .setLabel('Field Name')
                        .setStyle(
                            TextInputStyle.Short,
                        )
                        .setValue(field.name)
                        .setMaxLength(256)
                        .setRequired(true),
                ),

                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('field_value')
                        .setLabel('Field Value')
                        .setStyle(
                            TextInputStyle.Paragraph,
                        )
                        .setValue(field.value)
                        .setMaxLength(1024)
                        .setRequired(true),
                ),
            );

        const shown =
            await InteractionHelper.safeShowModal(
                selected,
                modal,
            );

        if (!shown) return;

        const submitted =
            await selected.awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        'eb_edit_field_modal' &&
                    i.user.id === selected.user.id,
                time: 120_000,
            }).catch(() => null);

        if (!submitted) return;

        const name =
            submitted.fields
                .getTextInputValue(
                    'field_name',
                )
                .trim();

        const value =
            submitted.fields
                .getTextInputValue(
                    'field_value',
                )
                .trim();

        state.fields[index] = {
            ...field,
            name,
            value,
        };

        await submitted.deferUpdate().catch(
            () => {},
        );

        await refreshDashboard(
            rootInteraction,
            state,
        );
    });
}

async function handleRemoveField(
    interaction,
    rootInteraction,
    state,
) {
    await interaction.deferUpdate();

    const select =
        new StringSelectMenuBuilder()
            .setCustomId(
                'eb_remove_field_pick',
            )
            .setPlaceholder(
                'Select a field to remove...',
            )
            .addOptions(
                state.fields
                    .slice(0, 25)
                    .map((field, index) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                `${index + 1}. ${field.name.substring(0, 90)}`,
                            )
                            .setValue(
                                String(index),
                            )
                            .setEmoji('➖'),
                    ),
            );

    await interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➖ Remove Field')
                .setDescription(
                    'Select the field you want to delete.',
                )
                .setColor(getColor('warning')),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                select,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId ===
                    'eb_remove_field_pick',
            time: 60_000,
            max: 1,
        });

    collector.on('collect', async selected => {
        await selected.deferUpdate();

        const index =
            Number.parseInt(
                selected.values[0],
                10,
            );

        state.fields.splice(index, 1);

        await refreshDashboard(
            rootInteraction,
            state,
        );
    });
}

async function handleReorderFields(
    interaction,
    rootInteraction,
    state,
) {
    await interaction.deferUpdate();

    const select =
        new StringSelectMenuBuilder()
            .setCustomId('eb_reorder_pick')
            .setPlaceholder(
                'Select a field...',
            )
            .addOptions(
                state.fields
                    .slice(0, 25)
                    .map((field, index) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(
                                `${index + 1}. ${field.name.substring(0, 90)}`,
                            )
                            .setValue(
                                String(index),
                            )
                            .setEmoji('↕️'),
                    ),
            );

    await interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('↕️ Reorder Fields')
                .setDescription(
                    'Select a field to move.',
                )
                .setColor(getColor('info')),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                select,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.StringSelect,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId ===
                    'eb_reorder_pick',
            time: 60_000,
            max: 1,
        });

    collector.on('collect', async selected => {
        await selected.deferUpdate();

        const index =
            Number.parseInt(
                selected.values[0],
                10,
            );

        const up = new ButtonBuilder()
            .setCustomId('eb_move_up')
            .setLabel('Move Up')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬆️')
            .setDisabled(index === 0);

        const down = new ButtonBuilder()
            .setCustomId('eb_move_down')
            .setLabel('Move Down')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬇️')
            .setDisabled(
                index ===
                    state.fields.length - 1,
            );

        const cancel = new ButtonBuilder()
            .setCustomId('eb_move_cancel')
            .setLabel('Cancel')
            .setStyle(
                ButtonStyle.Secondary,
            );

        await selected.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('↕️ Move Field')
                    .setDescription(
                        `Moving **${state.fields[index].name}**.`,
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    up,
                    down,
                    cancel,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        const buttonCollector =
            rootInteraction.channel.createMessageComponentCollector({
                componentType:
                    ComponentType.Button,
                filter: i =>
                    i.user.id ===
                        interaction.user.id &&
                    [
                        'eb_move_up',
                        'eb_move_down',
                        'eb_move_cancel',
                    ].includes(
                        i.customId,
                    ),
                time: 30_000,
                max: 1,
            });

        buttonCollector.on(
            'collect',
            async button => {
                await button.deferUpdate();

                if (
                    button.customId ===
                    'eb_move_cancel'
                ) {
                    return;
                }

                const target =
                    button.customId ===
                    'eb_move_up'
                        ? index - 1
                        : index + 1;

                if (
                    target < 0 ||
                    target >=
                        state.fields.length
                ) {
                    return;
                }

                const temp =
                    state.fields[index];

                state.fields[index] =
                    state.fields[target];

                state.fields[target] =
                    temp;

                await refreshDashboard(
                    rootInteraction,
                    state,
                );
            },
        );
    });
}

async function handlePostEmbed(
    interaction,
    rootInteraction,
    state,
    guild,
) {
    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name &&
        !state.footer?.text &&
        !state.image &&
        !state.thumbnail
    ) {
        await interaction.deferUpdate();

        await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message:
                'Add some content before posting.',
        });

        return;
    }

    await interaction.deferUpdate();

    const channelSelect =
        new ChannelSelectMenuBuilder()
            .setCustomId(
                'eb_post_channel',
            )
            .setPlaceholder(
                'Select a channel...',
            )
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
            );

    await interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📤 Post Message')
                .setDescription(
                    `Current format: **${
                        state.mode === 'v2'
                            ? 'Components V2'
                            : 'Classic V1 Embed'
                    }**\n\nSelect the channel where it should be posted.`,
                )
                .setColor(getColor('info')),
        ],
        components: [
            new ActionRowBuilder().addComponents(
                channelSelect,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.ChannelSelect,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId ===
                    'eb_post_channel',
            time: 60_000,
            max: 1,
        });

    collector.on('collect', async selected => {
        try {
            await selected.deferUpdate();

            const channel =
                selected.channels.first();

            if (!channel) {
                await replyUserError(
                    selected,
                    {
                        type: ErrorTypes.USER_INPUT,
                        message:
                            'Could not find that channel.',
                    },
                );

                return;
            }

            const me =
                guild.members.me;

            const permissions =
                channel.permissionsFor(me);

            if (
                !permissions?.has(
                    PermissionFlagsBits.SendMessages,
                )
            ) {
                await replyUserError(
                    selected,
                    {
                        type: ErrorTypes.PERMISSION,
                        message:
                            `I need **Send Messages** permission in ${channel}.`,
                    },
                );

                return;
            }

            if (
                state.mode === 'v1' &&
                !permissions.has(
                    PermissionFlagsBits.EmbedLinks,
                )
            ) {
                await replyUserError(
                    selected,
                    {
                        type: ErrorTypes.PERMISSION,
                        message:
                            `I need **Embed Links** permission in ${channel} to send a V1 embed.`,
                    },
                );

                return;
            }

            if (state.mode === 'v1') {
                const embed =
                    buildPreviewEmbed(
                        state,
                    );

                if (
                    embed.data.description ===
                    '*(Empty — use the menu below to add content)*'
                ) {
                    embed.setDescription(null);
                }

                await channel.send({
                    embeds: [embed],
                });
            } else {
                const container =
                    buildV2Message(state);

                /*
                 * IMPORTANT:
                 *
                 * Components V2 messages MUST use
                 * MessageFlags.IsComponentsV2.
                 *
                 * Do NOT include `embeds` or normal
                 * `content` in this message.
                 */
                await channel.send({
                    components: [container],
                    flags:
                        MessageFlags.IsComponentsV2,
                });
            }

            await selected.followUp({
                embeds: [
                    successEmbed(
                        'Message Sent',
                        `Your ${
                            state.mode === 'v2'
                                ? 'Components V2'
                                : 'V1 embed'
                        } was posted in ${channel}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error(
                'Failed to post embed builder message:',
                error,
            );

            await replyUserError(
                selected,
                {
                    type: ErrorTypes.UNKNOWN,
                    message:
                        'Failed to post the message.',
                },
            ).catch(() => {});
        }
    });
}

async function handleJsonExport(
    interaction,
    rootInteraction,
    state,
) {
    await interaction.deferUpdate();

    if (state.mode === 'v1') {
        const embed =
            buildPreviewEmbed(state);

        const json = JSON.stringify(
            embed.toJSON(),
            null,
            2,
        );

        if (json.length <= 3900) {
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            '📋 V1 Embed JSON',
                        )
                        .setDescription(
                            `\`\`\`json\n${json}\n\`\`\``,
                        )
                        .setColor(
                            getColor('info'),
                        ),
                ],
                flags:
                    MessageFlags.Ephemeral,
            });
        } else {
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            '📋 V1 Embed JSON',
                        )
                        .setDescription(
                            'The JSON is too large to display here.',
                        )
                        .setColor(
                            getColor('info'),
                        ),
                ],
                files: [
                    {
                        attachment:
                            Buffer.from(
                                json,
                                'utf8',
                            ),
                        name:
                            'embed-v1.json',
                    },
                ],
                flags:
                    MessageFlags.Ephemeral,
            });
        }

        return;
    }

    const container =
        buildV2Message(state);

    const json = JSON.stringify(
        container.toJSON(),
        null,
        2,
    );

    if (json.length <= 3900) {
        await interaction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        '📋 V2 Component JSON',
                    )
                    .setDescription(
                        `\`\`\`json\n${json}\n\`\`\``,
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            flags:
                MessageFlags.Ephemeral,
        });
    } else {
        await interaction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        '📋 V2 Component JSON',
                    )
                    .setDescription(
                        'The V2 JSON is too large to display here.',
                    )
                    .setColor(
                        getColor('info'),
                    ),
            ],
            files: [
                {
                    attachment:
                        Buffer.from(
                            json,
                            'utf8',
                        ),
                    name:
                        'components-v2.json',
                },
            ],
            flags:
                MessageFlags.Ephemeral,
        });
    }
}

export default {
    slashOnly: true,

    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription(
            'Build and post a V1 Embed or V2 Components message',
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages,
        ),

    async execute(interaction) {
        try {
            const deferred =
                await InteractionHelper.safeDefer(
                    interaction,
                    {
                        flags:
                            MessageFlags.Ephemeral,
                    },
                );

            if (!deferred) return;

            if (!interaction.guild) {
                await replyUserError(
                    interaction,
                    {
                        type:
                            ErrorTypes.VALIDATION,
                        message:
                            'This command can only be used inside a server.',
                    },
                );

                return;
            }

            const guild =
                interaction.guild;

            const state = {
                /*
                 * Default to V1 because V1 is the
                 * traditional Discord EmbedBuilder.
                 */
                mode: 'v1',

                title: null,
                description: null,
                url: null,

                color:
                    getColor('primary'),

                author: null,
                footer: null,

                thumbnail: null,
                image: null,

                timestamp: false,

                fields: [],
            };

            await refreshDashboard(
                interaction,
                state,
            );

            const collector =
                interaction.channel.createMessageComponentCollector({
                    componentType:
                        ComponentType.Button,

                    filter: i =>
                        i.user.id ===
                            interaction.user.id &&
                        i.customId.startsWith(
                            'eb_main_',
                        ),

                    time: IDLE_TIMEOUT,
                });

            collector.on(
                'collect',
                async button => {
                    try {
                        switch (
                            button.customId
                        ) {
                            case 'eb_main_mode_v1':
                                state.mode = 'v1';

                                await button.deferUpdate();

                                await refreshDashboard(
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_mode_v2':
                                state.mode = 'v2';

                                await button.deferUpdate();

                                await refreshDashboard(
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_edit_content':
                                await handleEditContent(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_set_color':
                                await handleSetColor(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_set_images':
                                await handleSetImages(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_set_author':
                                await handleSetAuthor(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_set_footer':
                                await handleSetFooter(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_add_field':
                                await handleAddField(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_edit_field':
                                await handleEditField(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_remove_field':
                                await handleRemoveField(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_reorder_fields':
                                await handleReorderFields(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_toggle_timestamp':
                                state.timestamp =
                                    !state.timestamp;

                                await button.deferUpdate();

                                await refreshDashboard(
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_post_embed':
                                await handlePostEmbed(
                                    button,
                                    interaction,
                                    state,
                                    guild,
                                );

                                break;

                            case 'eb_main_json_export':
                                await handleJsonExport(
                                    button,
                                    interaction,
                                    state,
                                );

                                break;

                            case 'eb_main_reset_all':
                                state.title = null;
                                state.description =
                                    null;
                                state.url = null;
                                state.color =
                                    getColor(
                                        'primary',
                                    );
                                state.author =
                                    null;
                                state.footer =
                                    null;
                                state.thumbnail =
                                    null;
                                state.image =
                                    null;
                                state.timestamp =
                                    false;
                                state.fields =
                                    [];

                                await button.deferUpdate();

                                await refreshDashboard(
                                    interaction,
                                    state,
                                );

                                break;

                            default:
                                await button
                                    .deferUpdate()
                                    .catch(
                                        () => {},
                                    );
                        }
                    } catch (error) {
                        logger.error(
                            'Error in embedbuilder collector:',
                            error,
                        );

                        const message =
                            error instanceof
                            TitanBotError
                                ? error.userMessage ||
                                  'An error occurred.'
                                : 'An unexpected error occurred.';

                        if (
                            !button.replied &&
                            !button.deferred
                        ) {
                            await button
                                .deferUpdate()
                                .catch(
                                    () => {},
                                );
                        }

                        await replyUserError(
                            button,
                            {
                                type:
                                    ErrorTypes.UNKNOWN,
                                message,
                            },
                        ).catch(
                            () => {},
                        );
                    }
                },
            );

            collector.on(
                'end',
                async (_, reason) => {
                    if (
                        reason === 'time'
                    ) {
                        await InteractionHelper.safeEditReply(
                            interaction,
                            {
                                components:
                                    [],
                            },
                        ).catch(
                            () => {},
                        );
                    }
                },
            );
        } catch (error) {
            if (
                error instanceof
                TitanBotError
            ) {
                throw error;
            }

            logger.error(
                'Unexpected error in embedbuilder:',
                error,
            );

            throw new TitanBotError(
                `embedbuilder failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the embed builder.',
            );
        }
    },
};
