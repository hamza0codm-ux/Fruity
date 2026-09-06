import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import {
    getTicketPanelStatus,
} from '../utils/panelStatus.js';

export async function reconcileTicketPanels(client) {
    const summary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await getGuildConfig(client, guild.id);

            if (!config?.ticketPanelChannelId) {
                continue;
            }

            const panelStatus =
                await getTicketPanelStatus(
                    client,
                    guild,
                    config
                );

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;

                config.ticketPanelMessageId =
                    panelStatus.recoveredId;

                await setGuildConfig(
                    client,
                    guild.id,
                    config
                );
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;
            } else if (
                panelStatus.reason === 'channel_missing'
            ) {
                summary.missingChannels += 1;

                logger.warn(
                    `Ticket panel channel missing for guild ${guild.id} (${guild.name})`
                );
            } else if (
                panelStatus.reason === 'panel_deleted'
            ) {
                summary.deletedPanels += 1;

                logger.warn(
                    `Ticket panel message deleted for guild ${guild.id} (${guild.name})`
                );
            }
        } catch (error) {
            summary.errors += 1;

            logger.warn(
                `Ticket panel health check failed for guild ${guild.id}:`,
                error.message
            );
        }
    }

    return summary;
}
