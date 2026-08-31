import { Events } from 'discord.js';
import { processMessageSecurity } from '../security/securityService.js';

export default {
    name: Events.MessageCreate,
    once: false,

    async execute(message) {
        await processMessageSecurity(message);
    },
};
