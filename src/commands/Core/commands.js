import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import {
  InteractionHelper,
} from '../../utils/interactionHelper.js';

import {
  successEmbed,
} from '../../utils/embeds.js';

import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';

import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  isProtectedCommand,
} from '../../services/commandAccessService.js';

function buildCategoryChoices(client) {
  const registry = buildCommandRegistry(client);

  return [...registry.values()]
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    )
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(
        0,
        100,
      ),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (
    !interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild,
    )
  ) {
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message:
        'You need the **Manage Server** permission to manage commands.',
    });

    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription(
      'Enable or disable bot commands and categories for this server',
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild,
    )
    .setDMPermission(false)

    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription(
          'Disable a command or entire category',
        )
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription(
              'Disable a single command or a whole category',
            )
            .setRequired(true)
            .addChoices(
              {
                name: 'Category',
                value: 'category',
              },
              {
                name: 'Command',
                value: 'command',
              },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription(
              'Category or command name',
            )
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription(
          'Enable a command or entire category',
        )
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription(
              'Enable a single command or a whole category',
            )
            .setRequired(true)
            .addChoices(
              {
                name: 'Category',
                value: 'category',
              },
              {
                name: 'Command',
                value: 'command',
              },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription(
              'Category or command name',
            )
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  category: 'Core',

  async autocomplete(interaction) {
    const focused =
      interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope =
      interaction.options.getString('scope');

    const query =
      String(focused.value || '').toLowerCase();

    // =========================
    // CATEGORY AUTOCOMPLETE
    // =========================

    if (scope === 'category') {
      const choices = buildCategoryChoices(
        interaction.client,
      )
        .filter(
          (choice) =>
            choice.name
              .toLowerCase()
              .includes(query) ||
            choice.value.includes(query),
        )
        .slice(0, 25);

      return interaction.respond(choices);
    }

    // =========================
    // COMMAND AUTOCOMPLETE
    // =========================

    const registry =
      buildCommandRegistry(
        interaction.client,
      );

    const allCommands = [];

    const matchedCategory =
      resolveCategoryChoice(
        interaction.client,
        query,
      );

    if (matchedCategory) {
      for (const command of matchedCategory.commands) {
        if (
          !isProtectedCommand(
            command.name,
          )
        ) {
          allCommands.push(
            command.name,
          );
        }
      }
    } else {
      for (const category of registry.values()) {
        for (const command of category.commands) {
          if (
            !isProtectedCommand(
              command.name,
            )
          ) {
            allCommands.push(
              command.name,
            );
          }
        }
      }
    }

    const choices = allCommands
      .filter((name) =>
        name.includes(query),
      )
      .slice(0, 25)
      .map((name) => ({
        name: `/${name}`,
        value: name,
      }));

    return interaction.respond(choices);
  },

  async execute(
    interaction,
    config,
    client,
  ) {
    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    const subcommand =
      interaction.options.getSubcommand();

    const scope =
      interaction.options.getString(
        'scope',
      );

    const target =
      interaction.options.getString(
        'target',
      );

    const isDisable =
      subcommand === 'disable';

    const deferred =
      await InteractionHelper.safeDefer(
        interaction,
        {
          ephemeral: true,
        },
      );

    if (!deferred) {
      return;
    }

    // =========================
    // CATEGORY
    // =========================

    if (scope === 'category') {
      const category =
        resolveCategoryChoice(
          client,
          target,
        );

      if (!category) {
        return await replyUserError(
          interaction,
          {
            type: ErrorTypes.UNKNOWN,
            message:
              `No category matched \`${target}\`.`,
          },
        );
      }

      if (isDisable) {
        await disableCategory(
          client,
          interaction.guildId,
          category.key,
        );

        return InteractionHelper.safeEditReply(
          interaction,
          {
            embeds: [
              successEmbed(
                'Category Disabled',
                `All **${category.displayName}** commands are now disabled.\nProtected commands remain available.`,
              ),
            ],
          },
        );
      }

      await enableCategory(
        client,
        interaction.guildId,
        category.key,
      );

      return InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Category Enabled',
              `**${category.displayName}** commands are now enabled (except individually disabled commands).`,
            ),
          ],
        },
      );
    }

    // =========================
    // COMMAND
    // =========================

    const commandName =
      target.toLowerCase();

    if (isDisable) {
      await disableCommand(
        client,
        interaction.guildId,
        commandName,
      );

      return InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Command Disabled',
              `\`/${commandName}\` is now disabled in this server.`,
            ),
          ],
        },
      );
    }

    await enableCommand(
      client,
      interaction.guildId,
      commandName,
    );

    return InteractionHelper.safeEditReply(
      interaction,
      {
        embeds: [
          successEmbed(
            'Command Enabled',
            `\`/${commandName}\` is now enabled in this server.`,
          ),
        ],
      },
    );
  },
};
