import { Events } from 'discord.js';
import { processMessageSecurity } from '../security/securityService.js';

export default {
    name: Events.MessageCreate,
    once: false,

    async execute(message) {
        try {
            if (!message.guild) return;
            if (message.author?.bot) return;

            console.log(
                `[SECURITY] Message received from ${message.author.tag}`
            );

            const triggered =
                await processMessageSecurity(message);

            if (triggered) {
                console.log(
                    `[SECURITY] Security violation detected from ${message.author.tag}`
                );
            }
        } catch (error) {
            console.error(
                '[SECURITY] Message security error:',
                error
            );
        }
    },
};
