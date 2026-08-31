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

    whitelistedUsers: new Set(),
    raidMode: new Set(),
    lockdownChannels: new Map(),
};

export function isWhitelisted(userId, guild) {
    if (!userId) return false;

    if (guild?.ownerId === userId) {
        return true;
    }

    return securityConfig.whitelistedUsers.has(userId);
}
