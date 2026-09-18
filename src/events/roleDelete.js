import { EmbedBuilder } from 'discord.js';
import { sendLog } from '../services/logger.js';

export default {
    name: 'roleDelete',

    async execute(role) {
        const embed = new EmbedBuilder()
            .setTitle('🔴 Role Deleted')
            .setColor(0xED4245)
            .addFields(
                {
                    name: 'Role',
                    value: role.name,
                },
                {
                    name: 'Role ID',
                    value: `\`${role.id}\``,
                }
            )
            .setTimestamp();

        await sendLog(role.client, 'server', embed);
    },
};
