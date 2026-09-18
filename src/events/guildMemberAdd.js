import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'guildMemberAdd',

    async execute(member) {
        if (!member.user.bot) return;

        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Added')
            .setColor(0x57F287)
            .addFields(
                {
                    name: 'Bot',
                    value: `${member.user} (\`${member.user.id}\`)`,
                },
                {
                    name: 'Username',
                    value: member.user.tag,
                }
            )
            .setTimestamp();

        await sendLog(member.client, 'bots', embed);
    },
};
