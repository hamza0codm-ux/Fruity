import { getFromDb, setInDb } from '../utils/database.js';

export const SECURITY_LOG_CHANNEL_ID = '1541557303453683792';

export const securityConfig = {
    enabled: true,

    phishing: {
        enabled: true,
        blockDiscordInvites: true,
        blockSuspiciousLinks: true,
    },

    spam: {
        enabled: true,
        messageLimit: 6,
        messageWindow: 5000,
        duplicateLimit: 3,
        duplicateWindow: 10000,
        mentionLimit: 8,
    },

    antiRaid: {
        enabled: true,
        joinLimit: 8,
        joinWindow: 10000,
        accountAgeDays: 7,
        timeoutMinutes: 10,
    },

    antiNuke: {
        enabled: true,
        actionLimit: 3,
        actionWindow: 10000,
        banExecutor: true,
        removeDangerousRoles: true,
    },

    lockdown: {
        enabled: false,
    },

    /*
     * Runtime whitelist cache.
     *
     * Stored as:
     * guildId:userId
     */
    whitelistedUsers: new Set(),

    /*
     * Tracks which guilds have had their whitelist
     * loaded from the database.
     */
    whitelistLoadedGuilds: new Set(),

    raidMode: new Set(),

    lockdownChannels: new Map(),

    /*
     * Minor security buttons stay active for 10 minutes.
     */
    minorActionTimeoutMs: 10 * 60 * 1000,
};

function getWhitelistKey(guildId) {
    return `security:whitelist:${guildId}`;
}

async function loadGuildWhitelist(client, guildId) {
    if (!client || !guildId) {
        return new Set();
    }

    if (securityConfig.whitelistLoadedGuilds.has(guildId)) {
        return new Set(
            [...securityConfig.whitelistedUsers]
                .filter(key => key.startsWith(`${guildId}:`))
                .map(key => key.split(':')[1])
        );
    }

    try {
        const stored = await getFromDb(
            getWhitelistKey(guildId),
            []
        );

        const users = Array.isArray(stored)
            ? stored
            : [];

        for (const userId of users) {
            if (!userId) continue;

            securityConfig.whitelistedUsers.add(
                `${guildId}:${userId}`
            );
        }

        securityConfig.whitelistLoadedGuilds.add(
            guildId
        );

        return new Set(users);
    } catch (error) {
        console.error(
            `[Security] Failed loading whitelist for ${guildId}:`,
            error
        );

        securityConfig.whitelistLoadedGuilds.add(
            guildId
        );

        return new Set();
    }
}

export async function isWhitelisted(
    userId,
    guild,
    client = null
) {
    if (!userId || !guild?.id) {
        return false;
    }

    /*
     * Server owner is always trusted.
     */
    if (guild.ownerId === userId) {
        return true;
    }

    /*
     * Load persisted whitelist if possible.
     */
    if (client) {
        await loadGuildWhitelist(
            client,
            guild.id
        );
    }

    return securityConfig.whitelistedUsers.has(
        `${guild.id}:${userId}`
    );
}

export async function addWhitelistedUser(
    client,
    guildId,
    userId
) {
    if (!guildId || !userId) {
        return false;
    }

    const users = await loadGuildWhitelist(
        client,
        guildId
    );

    users.add(userId);

    securityConfig.whitelistedUsers.add(
        `${guildId}:${userId}`
    );

    try {
        await setInDb(
            getWhitelistKey(guildId),
            [...users]
        );

        return true;
    } catch (error) {
        console.error(
            `[Security] Failed saving whitelist for ${guildId}:`,
            error
        );

        return false;
    }
}

export async function removeWhitelistedUser(
    client,
    guildId,
    userId
) {
    if (!guildId || !userId) {
        return false;
    }

    const users = await loadGuildWhitelist(
        client,
        guildId
    );

    users.delete(userId);

    securityConfig.whitelistedUsers.delete(
        `${guildId}:${userId}`
    );

    try {
        await setInDb(
            getWhitelistKey(guildId),
            [...users]
        );

        return true;
    } catch (error) {
        console.error(
            `[Security] Failed saving whitelist for ${guildId}:`,
            error
        );

        return false;
    }
}

export async function getWhitelist(
    client,
    guildId
) {
    return await loadGuildWhitelist(
        client,
        guildId
    );
}
