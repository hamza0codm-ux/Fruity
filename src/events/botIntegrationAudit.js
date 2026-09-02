import {
    Events,
    AuditLogEvent,
} from 'discord.js';

import {
    logEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    formatLogLine,
} from '../utils/logging/logEmbeds.js';

import {
    logger,
} from '../utils/logger.js';


const ACTIONS = new Map([
    [
        AuditLogEvent.BotAdd,
        {
            type:
                EVENT_TYPES.BOT_ADD,

            title:
                '🤖 Bot Added',
        },
    ],

    [
        AuditLogEvent.WebhookCreate,
        {
            type:
                EVENT_TYPES.WEBHOOK_CREATE,

            title:
                '🔗 Webhook Created',
        },
    ],

    [
        AuditLogEvent.WebhookUpdate,
        {
            type:
                EVENT_TYPES.WEBHOOK_UPDATE,

            title:
                '🔗 Webhook Updated',
        },
    ],

    [
        AuditLogEvent.WebhookDelete,
        {
            type:
                EVENT_TYPES.WEBHOOK_DELETE,

            title:
                '🔗 Webhook Deleted',
        },
    ],

    [
        AuditLogEvent.IntegrationCreate,
        {
            type:
                EVENT_TYPES.INTEGRATION_CREATE,

            title:
                '🔌 Integration Added',
        },
    ],

    [
        AuditLogEvent.IntegrationUpdate,
        {
            type:
                EVENT_TYPES.INTEGRATION_UPDATE,

            title:
                '🔌 Integration Updated',
        },
    ],

    [
        AuditLogEvent.IntegrationDelete,
        {
            type:
                EVENT_TYPES.INTEGRATION_DELETE,

            title:
                '🔌 Integration Removed',
        },
    ],
]);


/*
 * Discord audit-log targets are not always normal
 * User objects.
 *
 * Some targets return "[object Object]" when
 * .toString() is used.
 *
 * We therefore check useful properties FIRST.
 */
function getTargetName(target) {
    if (!target) {
        return 'Unknown';
    }

    return (
        target.name ||
        target.displayName ||
        target.username ||
        target.tag ||
        target.user?.tag ||
        target.user?.username ||
        target.application?.name ||
        target.integration?.name ||
        (
            target.id
                ? `Unknown • \`${target.id}\``
                : 'Unknown'
        )
    );
}


function getExecutorName(executor) {
    if (!executor) {
        return 'Unknown';
    }

    return (
        executor.tag ||
        executor.username ||
        executor.globalName ||
        (
            executor.id
                ? `<@${executor.id}>`
                : 'Unknown'
        )
    );
}


export default {
    name:
        Events.GuildAuditLogEntryCreate,

    once:
        false,

    async execute(
        entry,
        guild
    ) {
        try {
            if (!guild || !entry) {
                return;
            }


            const action =
                ACTIONS.get(
                    entry.action
                );

            if (!action) {
                return;
            }


            const lines = [];


            const target =
                entry.target;

            const executor =
                entry.executor;


            // TARGET
            if (target) {
                lines.push(
                    formatLogLine(
                        'Target',
                        getTargetName(target)
                    )
                );
            }


            // TARGET ID
            if (target?.id) {
                lines.push(
                    formatLogLine(
                        'Target ID',
                        `\`${target.id}\``
                    )
                );
            }


            // EXECUTOR
            if (executor) {
                lines.push(
                    formatLogLine(
                        'Executor',
                        `${getExecutorName(executor)} • \`${executor.id}\``
                    )
                );
            }


            // REASON
            if (entry.reason) {
                lines.push(
                    formatLogLine(
                        'Reason',
                        entry.reason
                    )
                );
            }


            await logEvent({
                client:
                    guild.client,

                guildId:
                    guild.id,

                eventType:
                    action.type,

                data: {
                    title:
                        action.title,

                    lines,

                    quoted:
                        false,
                },
            });

        } catch (error) {
            logger.error(
                'Error in botIntegrationAudit:',
                error
            );
        }
    },
};
