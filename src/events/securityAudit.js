import {
    Events,
    AuditLogEvent,
} from 'discord.js';

import {
    processAuditAction,
} from '../security/securityService.js';

export default {
    name: Events.GuildAuditLogEntryCreate,
    once: false,

    async execute(entry, guild) {
        try {
            const supportedActions = new Set([
                AuditLogEvent.ChannelDelete,
                AuditLogEvent.RoleDelete,
                AuditLogEvent.MemberBanAdd,
                AuditLogEvent.MemberKick,
                AuditLogEvent.WebhookDelete,
                AuditLogEvent.WebhookCreate,
                AuditLogEvent.ChannelCreate,
                AuditLogEvent.RoleCreate,
                AuditLogEvent.MemberUpdate,
                AuditLogEvent.GuildUpdate,
                AuditLogEvent.BotAdd,
            ]);

            if (!supportedActions.has(entry.action)) {
                return;
            }

            const executor = entry.executor;

            if (!executor) {
                return;
            }

            await processAuditAction({
                client: guild.client,
                guild,
                executor,
                action: entry.action,
                target: entry.target,
            });
        } catch (error) {
            console.error(
                '[SECURITY AUDIT ERROR]',
                error
            );
        }
    },
};
