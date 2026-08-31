import { Events } from 'discord.js';
import { processRaidJoin } from '../security/securityService.js';

export default {
    name: Events.GuildMemberAdd,
    once: false,

    async execute(member) {
        await processRaidJoin(member);
    },
};
