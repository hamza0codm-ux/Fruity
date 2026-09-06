import { Events } from "discord.js";

import {
  logger,
  startupLog,
} from "../utils/logger.js";

import { botConfig } from "../config/bot.js";

import {
  reconcileTicketPanels,
} from "../services/panelHealthService.js";

import {
  reconcileLevelRoles,
} from "../services/leveling/levelRoleSyncService.js";

import {
  initRiffyAfterReady,
} from "../services/music/riffySetup.js";

// ============================================================
// SECURITY
// ============================================================

import {
  registerSecurityEvents,
} from "./securityEvents.js";

// ============================================================
// NORMAL TICKETS
// ============================================================

import {
  reconcileNormalTicketPanel,
} from "../tickets/normalTickets.js";

// ============================================================
// MERCH TICKETS
// ============================================================

import {
  reconcileMerchTicketPanel,
} from "../tickets/merchTickets.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      // ======================================================
      // BOT PRESENCE
      // ======================================================

      client.user.setPresence({
  status: 'dnd',
  activities: [
    {
      name: 'Fruity',
      type: 4,
    },
  ],
});

      // ======================================================
      // STARTUP INFORMATION
      // ======================================================

      startupLog(
        `Ready! Logged in as ${client.user.tag}`
      );

      startupLog(
        `Serving ${client.guilds.cache.size} guild(s)`
      );

      startupLog(
        `Loaded ${client.commands.size} commands`
      );

      // ======================================================
      // SECURITY
      // ======================================================

      if (client.config?.features?.security !== false) {
        try {
          registerSecurityEvents(client);

          startupLog(
            "Security event system initialized."
          );
        } catch (error) {
          logger.error(
            "Failed to initialize security event system:",
            error
          );
        }
      }

      // ======================================================
      // MUSIC
      // ======================================================

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

      // ======================================================
      // TICKET PANEL HEALTH
      // ======================================================

      const ticketPanelSummary =
        await reconcileTicketPanels(client);

      startupLog(
        `Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
      );

      // ======================================================
      // NORMAL TICKETS PANEL
      // ======================================================

      await reconcileNormalTicketPanel(client);

      startupLog(
        "Normal Tickets panel reconciliation completed."
      );

      // ======================================================
      // MERCH TICKETS PANEL
      // ======================================================

      await reconcileMerchTicketPanel(client);

      startupLog(
        "Merch Tickets panel reconciliation completed."
      );

      // ======================================================
      // LEVEL ROLES
      // ======================================================

      const levelRoleSummary =
        await reconcileLevelRoles(client);

      startupLog(
        `Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`
      );

    } catch (error) {
      logger.error(
        "Error in ready event:",
        error
      );
    }
  },
};
