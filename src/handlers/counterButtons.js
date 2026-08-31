import { createEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import {
  ErrorTypes,
  replyUserError,
  handleInteractionError,
} from '../utils/errorHandler.js';

export const counterDeleteActionHandler = {
  name: 'counter-delete',

  async execute(interaction, client, args = []) {
    try {
      if (!interaction.inGuild()) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'This action can only be used in a server.',
        }).catch(() => {});

        return;
      }

      const [action, counterId, ownerId] = args;

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'Only the user who initiated this deletion can use these buttons.',
        }).catch(() => {});

        return;
      }

      if (!action || !counterId) {
        await replyUserError(interaction, {
          type: ErrorTypes.VALIDATION,
          message:
            'Counter delete action data is missing.',
        }).catch(() => {});

        return;
      }

      if (action === 'cancel') {
        await interaction.deferUpdate().catch(() => {});

        await interaction.editReply({
          embeds: [
            createEmbed({
              title: '❌ Cancelled',
              description:
                'Counter deletion cancelled.',
              color: 'error',
            }),
          ],
          components: [],
        }).catch(() => {});

        return;
      }

      /*
       * The original counter deletion implementation depended on
       * src/commands/ServerStats/modules/serverstats_delete.js,
       * which no longer exists.
       *
       * We intentionally fail gracefully instead of importing a
       * missing module and preventing this handler from loading.
       */
      if (action === 'confirm') {
        await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message:
            'The counter deletion system is currently unavailable because its ServerStats module was removed.',
        }).catch(() => {});

        logger.warn(
          `Counter deletion requested for ${counterId}, but ServerStats deletion module is unavailable.`
        );

        return;
      }

      await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message:
          'Unknown counter delete action.',
      }).catch(() => {});
    } catch (error) {
      await handleInteractionError(
        interaction,
        error,
        {
          type: 'button',
          handler: 'counter_delete',
          customId: interaction.customId,
        }
      );
    }
  },
};

export default counterDeleteActionHandler;
